import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Card, Button, Modal } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import "./style-DONOTUSE.css";

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
  const [showModal, setShowModal] = useState(false);

  const tagChange = (event) => {
    setTagValue(event.target.value);
  };

  const sendErrorToUser = (message) => {
    setErrorMessage(message);
  };

  const uploadVideo = async () => {
    setTagDisabled(false);
    const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    const formData = new FormData();
    formData.append('video', videoBlob, 'recorded-video.webm');
    formData.append('tagValue', tagValue);
    try {
      await axios.post('/api/v2/train', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      sendErrorToUser('Failed to upload video.');
    }
    setRecordedChunks([]);
  };

  const startRecording = () => {
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
      }, 12000);
    } else {
      sendErrorToUser('Webcam reference is not set or stream is invalid.');
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
        alert("Image saved successfully");
      } catch (error) {
        console.error('Error uploading the image:', error);
        alert("Error uploading the image");
      }
    } else {
      setHasError(true);
    }
  };

  const handleClear = async () => {
    try {
      await axios.post('/api/v2/clear', [], {});
      alert('Cleared');
    } catch (error) {
      console.error('Error clearing model:', error);
      alert('Failed to clear the model.');
    }
  };

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
      }

      setPermissionGranted(true);
      setHasError(false);
    } catch (error) {
      console.error('Error accessing webcam:', error);
      sendErrorToUser(`Error accessing webcam: ${error.message}`);
      setHasError(true);
    }
  };

  const handleGetWheelID = () => {
    startWebcam();
  };

  const handleTrainWheel = () => {
    startWebcam();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'camera' })
        .then((permissionStatus) => {
          if (permissionStatus.state === 'granted') {
            setPermissionGranted(true);
          } else {
            setHasError(true);
          }
        })
        .catch((error) => {
          console.error('Error checking camera permissions:', error);
          setHasError(true);
        });
    }
  }, []);

  if (hasError) {
    return (
      <Container>
        <Card className="mt-5">
          <Card.Body>
            <Card.Header as="h2">Wheel Identification System</Card.Header>
            <div className="mt-3 flex">
              <Button variant="primary" onClick={startWebcam} className="me-2">
                Get Wheel ID
              </Button>
              <Button variant="success" onClick={startWebcam}>
                Train Wheel
              </Button>
            </div>
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

      <Card className="mt-5">
        <Card.Body>
          <Card.Header as="h2">Wheel Identification System</Card.Header>
          <div className="mt-3">
            <Button variant="primary" onClick={handleGetWheelID} className="me-2">
              Get Wheel ID
            </Button>
            <Button variant="success" onClick={handleTrainWheel}>
              Train Wheel
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={closeModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Train Wheel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            <label>Add Wheel SKU:</label>
            <input
              className="form-control mb-2"
              type="text"
              onChange={tagChange}
              disabled={tagDisabled}
            />
            {recording ? (
              <Button onClick={stopRecording}>Stop Recording</Button>
            ) : (
              <Button onClick={startRecording}>Start Recording</Button>
            )}
            {videoURL && (
              <Button onClick={uploadVideo} className="ms-2">
                Start Uploading
              </Button>
            )}
            <Button onClick={handleClear} className="ms-2">
              Clear Model
            </Button>
          </div>
          {videoURL && (
            <div className="mt-3">
              <p>Recorded Video:</p>
              <video src={videoURL} controls style={{ width: '100%', maxHeight: '400px' }} />
            </div>
          )}
          <video
            ref={webcamRef}
            className="mt-3"
            autoPlay
            playsInline
            style={{ width: '100%', maxHeight: '400px' }}
          />
        </Modal.Body>
      </Modal>

      {permissionGranted && !showModal && (
        <div className="mt-3">
          <video
            ref={webcamRef}
            autoPlay
            playsInline
            style={{ width: '100%', maxHeight: '400px'}}
          />
          <input type="file" accept="image/*" capture="environment" onChange={handleCapture} className="mt-2" />
          {image && (
            <div className="mt-2">
              <p>Captured Image:</p>
              <img src={image} alt="Captured" style={{ width: '100%', maxHeight: '400px' }} />
            </div>
          )}
        </div>
      )}
    </Container>
  );
};

export default WebCamCapture;