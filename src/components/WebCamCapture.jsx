import axios from 'axios';
import React, { useRef, useState, useEffect } from 'react';
//import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import {Container, Row, Col, Card, Button, ListGroup} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
//import './style.css';

const WebCamCapture = () => {
  const webcamRef = useRef(null);
  const [image, setImage] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const [tagValue, setTagValue] = useState('');
  const [tagDisabled, setTagDisabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const tagChange = (event) => {
    setTagValue(event.target.value); // Update the state with the input's value
  };

  const sendErrorToUser = (message) => {
    setErrorMessage(message);  // Set the error message in state
  };

  const uploadVideo = async() =>{
    setTagDisabled(false);

    const videoBlob = new Blob(recordedChunks, {type:'video/webm'});

    const formData = new FormData();
    formData.append('video', videoBlob, 'recorded-video.webm');
    formData.append('tagValue', tagValue);
    try{
      const response = await axios.post('/api/v2/train', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    } catch(error){
    }

    setRecordedChunks([]);
  }

  const startRecording = () => {
    // Check if webcamRef is set and contains a valid MediaStream
    if (webcamRef.current && webcamRef.current.srcObject instanceof MediaStream) {
      if (tagValue === '') {
        sendErrorToUser('Please input a tag for this video.');
        return;
      } else if (!tagValue.startsWith('ALY') && !tagValue.startsWith('STL')) {
        sendErrorToUser('Tag must start with "ALY" or "STL".');
        return;
      } else {
        setTagDisabled(true);
      }
  
      const stream = webcamRef.current.srcObject;
      const mediaRecorder = new MediaRecorder(stream);
  
      mediaRecorderRef.current = mediaRecorder;
  
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);

          const videoBlob = new Blob([event.data], { type: 'video/webm' });
          const videoURL = URL.createObjectURL(videoBlob);
          setVideoURL(videoURL);

        }
      };
  
      mediaRecorder.start();
      setRecording(true);
      setTimeout(() => {
        stopRecording();
      }, 12000); // Record for 3 seconds
    } else {
      sendErrorToUser('Webcam reference is not set or stream is invalid.');  // Notify user
      console.log('webcamRef.current:', webcamRef.current);  // Log the webcamRef to inspect it
      console.log('webcamRef.current.srcObject:', webcamRef.current ? webcamRef.current.srcObject : null);  // Log srcObject
    }
  };
  
  // Starting the webcam stream
  const startWebcam = async () => {
    
    try {
      // Request camera access with simplified constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment' 
          // facingMode: { exact: 'environment' }, // Force back camera
        },
        audio: false, // No audio
      });
  
      // Log the stream for inspection
      console.log('Stream:', stream);
  
      if (webcamRef.current) {
        webcamRef.current.srcObject = stream; // Assign the stream to the video element
      }
  
      setPermissionGranted(true);
      setHasError(false);
    } catch (error) {
      console.error('Error accessing webcam:', error);
      sendErrorToUser(`Error accessing webcam: ${error.message} (${error.name})`);
  
      // Check if camera is already in use
      if (error.name === 'NotAllowedError') {
        sendErrorToUser('Camera access denied. Please grant camera permissions.');
      } else if (error.name === 'NotFoundError') {
        sendErrorToUser('No camera device found.');
      } else if (error.name === 'NotReadableError') {
        sendErrorToUser('Camera is already in use by another application.');
      } else {
        sendErrorToUser('An unknown error occurred.');
      }
  
      setHasError(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleCapture = async (event) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
      
      const formData = new FormData();
      formData.append("image", file);

      try {
        const response = await axios.post("/api/v1/predict", formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log(response.data);
        alert("Image saved successfully")
      } catch (error) {
        console.error('Error uploading the image:', error);
        alert("Error uploading the image:", error);
      }
    } else {
      setHasError(true);
    }
  };

  const handleClear = async (event) => {
    try{
      await axios.post('/api/v2/clear',[],{});
      alert('Cleared');
    } catch(error){
      console.error('Error clearing model:', error);
      alert('Failed to clear the model.');

    }
  }



  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((permissionStatus) => {
          if (permissionStatus.state === 'denied' || permissionStatus.state === 'prompt') {
            setHasError(true);
          } else {
            startWebcam();
          }
  
          permissionStatus.onchange = () => {
            if (permissionStatus.state === 'denied') {
              setHasError(true);
              setPermissionGranted(false);
            } else {
              setHasError(false);
              setPermissionGranted(true);
              startWebcam();
            }
          };
        })
        .catch((error) => {
          console.error('Error checking camera permissions:', error);
          setHasError(true);
        });
    } else {
      // Fallback: Directly request camera access
      startWebcam();
    }
  }, []);

  if (hasError) {
    return (
      <Container>
        <Card className="mt-5">
          <Card.Body>
            <Card.Header as="h2">Wheel Indentification System</Card.Header>
            <br/>
            <Card.Title as="h5">
              <Button variant="primary"
                onClick={startWebcam}
              >
                Get Wheel ID
              </Button>
            </Card.Title>
            <br/>
            <Card.Title as="h5">
              <Button variant="success"
                onClick={startWebcam}
              >
                Train Wheel
              </Button>
            </Card.Title>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      {errorMessage && (
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
       )}

      <Container>
        <Card className="mt-5">
          <Card.Body>
            <Card.Header as="h2">Wheel Indentification System</Card.Header>
          </Card.Body>
        </Card>
      </Container>
      {permissionGranted ? (
        <>
         <Container className="mt-3">
            <Card>
              <Card.Header>Get Wheel ID</Card.Header>
              <Card.Body>
                
                {
                  <input type="file" accept="image/*" capture="environment" onChange={handleCapture} />
                }
                {image && (
                  <div>
                    <p>Captured Image:</p>
                    <img src={image} alt="Captured" style={{ width: '100%', maxHeight: '400px' }} />
                  </div>
                )}

              </Card.Body>
            </Card>

          </Container>

          <Container className="mt-3">
            <Card>
              <Card.Header as="h4" className="mt-1">Train Wheel</Card.Header>
              <Card.Body>Add Wheel SKU <br></br>
                <input className="m-2" type="text" onChange={tagChange} disabled={tagDisabled}></input> <br></br>
                {recording ? (
                  <Button>
                    Stop Recording
                  </Button>
                ) : (
                  <Button onClick={startRecording}>
                    Start Recording
                  </Button>
                )}
                {
                  videoURL && (
                    <Button onClick={uploadVideo}>
                      Start Uploading
                    </Button>
                  )
                }
                {
                  <Button onClick={handleClear}>
                    Clear Model
                  </Button>
                }
                {videoURL && (
                  <div>
                    <div className={'tag-record-div'}>

                      <p>Recorded Video:</p>
                    </div>
                    <video src={videoURL} controls style={{ width: '100%', maxHeight: '400px' }} />
                  </div>
                )}
                {
                  recording ? (
                    <video ref={webcamRef} className="mt-3" autoPlay playsInline style={{ width: '100%', maxHeight: '400px' }} />
                  ):
                  (
                    <video ref={webcamRef} className="mt-3" autoPlay playsInline style={{ width: '100%', maxHeight: '400px' }} />
                  )
                }
              </Card.Body>
            </Card>
          </Container>
        </>
      ) : (
        <Button onClick={startWebcam}>
          Enable Camera
        </Button>
      )}

    </Container>
  );
};



export default WebCamCapture;
