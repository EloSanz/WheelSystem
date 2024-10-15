const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const AWS = require('aws-sdk');
const path = require('path');
const TrainingApi = require('@azure/cognitiveservices-customvision-training');
const msRest = require('@azure/ms-rest-js');

const endpoint = process.env.VISION_TRAINING_ENDPOINT || '';
const trainingKey = process.env.VISION_TRAINING_KEY || '';
const projectId = process.env.VISION_PROJECT_ID || '';
const modelId = process.env.CUSTOM_VISION_MODEL_ID || '';
const bucketName = process.env.AWS_S3_BUCKET_NAME || ''; // Corrected: Added the bucketName variable
if (!endpoint || !trainingKey || !projectId || !modelId || !bucketName) {
  throw new Error('Missing required environment variables');
}

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Utility function to introduce delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const uploadToS3 = (filePath, key) => {
  const fileStream = fs.createReadStream(filePath);
  const uploadParams = {
    Bucket: bucketName,  // Ensure we're using the bucketName here
    Key: key,
    Body: fileStream,
    ACL: 'public-read',
  };

  return s3.upload(uploadParams).promise();
};

const trainController = {
  trainImage: async (req, res, next) => {
    try {
      const credentials = new msRest.ApiKeyCredentials({
        inHeader: { 'Training-key': trainingKey },
      });
      const trainer = new TrainingApi.TrainingAPIClient(credentials, endpoint);
      const videoFile = req.file;
      const tagValue = req.body.tagValue.toUpperCase();
      const videoPath = videoFile.path;
      
      const currentDateTime = new Date().toISOString().replace(/:/g, '-');
      
      const publishName = `Iteration${currentDateTime}`;
      const framesDir = path.join(__dirname, '..', 'frames', tagValue);

      if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
      }

      ffmpeg.setFfmpegPath(ffmpegStatic);

      ffmpeg(videoPath)
        .on('filenames', (filenames) => {
          console.log('Frames will be saved as:', filenames);
        })
        .on('end', async () => {
          console.log('Frames extracted successfully.');

          const frameFiles = fs.readdirSync(framesDir);
          const trainImages = [];

          const uploadPromises = frameFiles.map(async (file) => {
            const filePath = path.join(framesDir, file);
            const s3Key = `frames/${tagValue}/${file}`;
            await uploadToS3(filePath, s3Key);
            trainImages.push(
              `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`
            );
          });

          const deleteTag = async (tagId) => {
            try {
              await trainer.deleteTag(projectId, tagId);
              console.log(`Tag with ID ${tagId} deleted.`);
            } catch (err) {
              console.error('Error deleting tag:', err);
              res.status(500).json({ message: `Error deleting tag ${tagId}`, err });
            }
          };

          await Promise.all(uploadPromises);

          frameFiles.forEach((file) =>
            fs.unlinkSync(path.join(framesDir, file))
          );

          fs.rmdirSync(framesDir);

          const tags = await trainer.getTags(projectId);
          let tagId = '';
          const existingTag = tags.find((t) => t.name === tagValue);

          if (existingTag) {
            console.log('Tag Name already exists');
            tagId = existingTag.id;
          } else {
            console.log('Creating a new tag');
            const newTag = await trainer.createTag(projectId, tagValue);
            tagId = newTag.id;
          }

          if (trainImages.length >= 5) {
            const imagesToUpload = trainImages.map((imageUrl) => ({
              url: imageUrl,
              tagIds: [tagId],
            }));
            try{
              const response = await trainer.createImagesFromUrls(projectId, {
                images: imagesToUpload,
              });
            } catch(error){

            }
            const tagImages = await trainer.getTaggedImages(projectId, {
              tagIds: [tagId],
              take: 256,  // Set to the maximum allowed limit of 256
            });

            console.log(`Number of images with tag ${tagId}:`, tagImages.length);

            if (tagImages.length >= 5) {
              console.log('Triggering training...');
              try {
                const iteration = await trainer.trainProject(projectId);

                let iterationStatus = 'Training';
                const POLLING_INTERVAL = 5000; // 5 seconds

                // Polling for the iteration to complete training
                while (iterationStatus === 'Training' || iterationStatus === 'InProgress') {
                  // Wait for 5 seconds before checking the status again
                  console.log(`Waiting for iteration to complete, current status: ${iterationStatus}`);
                  await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));

                  // Fetch the latest status of the iteration
                  const currentIteration = await trainer.getIteration(projectId, iteration.id);
                  iterationStatus = currentIteration.status;
                  console.log(`Iteration Status: ${iterationStatus}`);

                  // If training has completed, proceed to publishing
                  if (iterationStatus === 'Completed') {
                    console.log('Training completed, publishing the iteration.');
                    await trainer.publishIteration(projectId, iteration.id, publishName, process.env.PREDICTION_RESOURCE_ID);
                    res.status(200).json({
                      message: 'Video processed, images trained successfully, and model published.',
                    });
                    return;
                  }

                  // If training has failed, throw an error
                  if (iterationStatus === 'Failed') {
                    console.log('Training failed for iteration.');
                    return;
                  }
                }
              } catch (error) {
                console.log(error);
                if(tags.length >= 2)
                  await deleteTag(tagId);
                res.status(400).json({
                  message: 'Training Not Completed. Tag Deleted',
                });
              }
            } else {
              
              if(tags.length >= 1)
              {
                try{
                  await deleteTag(tagId);
                } catch(error){
                }
              }
              res.status(400).json({
                message: `Not enough valid images uploaded. You uploaded ${trainImages.length}, but only ${tagImages.length} images were accepted.`,
              });
            }
          } else {
            if(tags.length >= 1)
            {
              try{
                await deleteTag(tagId);
              }catch(error){

              }
            }
            res.status(400).json({
              message: `Not enough images for training. You uploaded ${trainImages.length}, but at least 5 images are required.`,
            });
          }
        })
        .on('error', (err) => {
          console.error('Error extracting frames:', err);
          res.status(500).json({ message: 'Error processing video' });
        })
        .save(path.join(framesDir, 'frame-%03d.png'));
    } catch (error) {
      console.error('Error handling upload:', error);
      res.status(500).json({ message: 'Error uploading video', error });
    }
  },
  clearTags: async (req, res, next) => {
    try {

      const credentials = new msRest.ApiKeyCredentials({
        inHeader: { 'Training-key': trainingKey },
      });
      const trainer = new TrainingApi.TrainingAPIClient(credentials, endpoint);

      const listTags = async () => {
        try {
          const tags = await trainer.getTags(projectId);
          console.log('List of Tags:', tags);
          return tags;
        } catch (err) {
          console.error('Error retrieving tags:', err);
          res.status(500).json({ message: 'Error retrieving tags', err });
        }
      };

      // Step 2: Delete a specific tag by ID
      const deleteTag = async (tagId) => {
        try {
          await trainer.deleteTag(projectId, tagId);
          console.log(`Tag with ID ${tagId} deleted.`);
        } catch (err) {
          console.error('Error deleting tag:', err);
          res.status(500).json({ message: `Error deleting tag ${tagId}`, err });
        }
      };

      // Step 3: Clear (Delete) all tags in the project
      const tags = await listTags();  // Retrieve all tags
      if (!tags || tags.length === 0) {
        console.log('No tags found in the project.');
        res.status(200).json({ message: 'No tags found in the project.' });
        return;
      }

      // Loop through all tags and delete them one by one
      for (const tag of tags) {
        await deleteTag(tag.id);
      }

      console.log('All tags have been cleared from the project.');
      res.status(200).json({ message: 'All tags have been cleared from the project.' });
    } catch (err) {
      console.error('Error clearing tags:', err);
      res.status(500).json({ message: 'Error clearing tags', err });
    }
  }
};

module.exports = trainController;
