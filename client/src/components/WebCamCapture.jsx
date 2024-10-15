import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { Container, Card, Button, Modal } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style-DONOTUSE.css";

const WebCamCapture = () => {
  const webcamRef = useRef(null);
  const [videoURL, setVideoURL] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const [tagValue, setTagValue] = useState("");
  const [tagDisabled, setTagDisabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false); // for error modal

  const tagChange = (event) => {
    setTagValue(event.target.value);
  };

  const sendErrorToUser = (message) => {
    setErrorMessage(message);
  };

  const uploadVideo = async () => {
    setTagDisabled(false);
    const videoBlob = new Blob(recordedChunks, { type: "video/webm" });
    const formData = new FormData();
    formData.append("video", videoBlob, "recorded-video.webm");
    formData.append("tagValue", tagValue);
    try {
      await axios.post("/api/v2/train", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    } catch (error) {
      console.error("Error uploading video:", error);
      sendErrorToUser("Failed to upload video.");
    }
    setRecordedChunks([]);
  };

  const startRecording = () => {
    if (
      webcamRef.current &&
      webcamRef.current.srcObject instanceof MediaStream
    ) {
      if (tagValue === "") {
        sendErrorToUser("Please input a tag for this video.");
        return;
      } else if (!tagValue.startsWith("ALY") && !tagValue.startsWith("STL")) {
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
          const videoBlob = new Blob([event.data], { type: "video/webm" });
          const videoURL = URL.createObjectURL(videoBlob);
          setVideoURL(videoURL);
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setTimeout(() => {
        stopRecording();
      }, 10000);  // set the limit of recording video: 10000 = 10s
    } else {
      sendErrorToUser("Webcam reference is not set or stream is invalid.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
      }

      setPermissionGranted(true);
      setHasError(false);
    } catch (error) {
      console.error("Error accessing webcam:", error);
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
    setErrorMessage(""); // clear the error when close the modal
  };

  const closeErrorModal = () => { // when the close error modal button is clicked
    setShowErrorModal(false);
    setErrorMessage(""); // clear the error when close the error modal
  };

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "camera" })
        .then((permissionStatus) => {
          if (permissionStatus.state === "granted") {
            setPermissionGranted(true);
          } else {
            setHasError(true);
          }
        })
        .catch((error) => {
          console.error("Error checking camera permissions:", error);
          setHasError(true);
        });
    }
  }, []);

  useEffect(() => { // set the showErrorModal variable when the showModal or errorMessage button is clicked
    if (errorMessage !== "" && showModal) {
      setShowErrorModal(true);
    }
  }, [showModal, errorMessage]);

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
      {errorMessage &&
        !showModal && ( // show the error when showModal is false
          <div className="alert alert-danger" role="alert">
            {errorMessage}
          </div>
        )}

      <Card className="mt-5">
        <Card.Body>
          <Card.Header as="h2">Wheel Identification System</Card.Header>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={handleGetWheelID}
              className="me-2"
            >
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
            {/* <Button onClick={handleClear} className="ms-2"> // remove the clear model button
              Clear Model
            </Button> */}
          </div>
          {videoURL && (
            <div className="mt-3">
              <p>Recorded Video:</p>
              <video
                src={videoURL}
                controls
                style={{ width: "100%", maxHeight: "400px" }}
              />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <video
              ref={webcamRef}
              autoPlay
              playsInline
              style={{ width: '100%', maxHeight: '400px'}}
            />
            {/* Overlay circle with green border */}
            <div className="overlay-circle" style={{ 
              border: `5px solid ${tagDisabled ? "green" : "red"}`,
              backgroundColor: tagDisabled ? "rgba(0, 0, 0, 0)" : "rgba(255, 0, 0, 0.5)"
            }}>
              {tagDisabled ? "" : <div className='overlay-text'>Move closer until the object fits within the circle</div>}
            </div>
          </div>
        </Modal.Body>
      </Modal>

      <Modal //======================== error modal part
        show={showErrorModal}
        onHide={closeErrorModal}
        style={{ marginTop: "100px" }}
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ color: "#ffaeb5" }}>Error</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorMessage && (
            <div className="alert alert-danger" role="alert">
              {errorMessage}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {permissionGranted && !showModal && (
        <div className="mt-3">
          <video
            ref={webcamRef}
            autoPlay
            playsInline
            style={{ width: "100%", maxHeight: "400px" }}
          />
        </div>
      )}
    </Container>
  );
};

export default WebCamCapture;
