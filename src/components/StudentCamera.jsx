import { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

export default function StudentCamera({ onStatusChange, onFrameCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('attentive');

  // Load face-api models
  useEffect(() => {
    const loadModels = async () => {
      try {
        console.log('📦 Loading face detection models...');
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        
        console.log('✅ Models loaded');
        setModelsLoaded(true);
      } catch (err) {
        console.error('❌ Model loading error:', err);
      }
    };

    loadModels();
  }, []);

  // Start camera and detection
  useEffect(() => {
    if (!modelsLoaded) return;

    let mounted = true;

    const startCamera = async () => {
      try {
        console.log('📹 Starting student camera...');
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          console.log('✅ Student camera started');

          // Wait 2 seconds then start detection
          setTimeout(() => {
            if (!mounted) return;

            // ✅ Detection every 3 seconds
            detectionIntervalRef.current = setInterval(() => {
              detectAttention();
            }, 3000);

            // ✅ Frame capture on ODD seconds only (staggered with teacher)
            frameIntervalRef.current = setInterval(() => {
              const currentSecond = new Date().getSeconds();
              if (currentSecond % 2 === 0) return; // Skip even seconds
              
              captureFrame();
            }, 1000);

            console.log('✅ Detection and frame capture started');
          }, 2000);
        }
      } catch (err) {
        console.error('❌ Camera error:', err);
      }
    };

    const detectAttention = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      try {
        const video = videoRef.current;
        
        // Detect face and landmarks
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks();

        if (!detection) {
          // No face detected
          updateStatus('no_face', 0.8);
          return;
        }

        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose();

        // Calculate Eye Aspect Ratio (EAR)
        const ear = calculateEAR(leftEye, rightEye);
        
        // Calculate head pose (yaw and pitch)
        const { yaw, pitch } = calculateHeadPose(landmarks);

        console.log(`📊 Detection: EAR=${ear.toFixed(3)}, Yaw=${yaw}°, Pitch=${pitch}°`);

        // Determine status
        let status = 'attentive';
        let confidence = 0.95;

        // Check for drowsiness (eyes closed)
        if (ear < 0.2) {
          status = 'drowsy';
          confidence = 0.9;
        }
        // Check for looking away (head turned)
        else if (Math.abs(yaw) > 25 || Math.abs(pitch) > 25) {
          status = 'looking_away';
          confidence = 0.85;
        }

        updateStatus(status, confidence);

      } catch (err) {
        console.error('❌ Detection error:', err);
      }
    };

    const calculateEAR = (leftEye, rightEye) => {
      // Eye Aspect Ratio calculation
      const leftEAR = getEyeAspectRatio(leftEye);
      const rightEAR = getEyeAspectRatio(rightEye);
      return (leftEAR + rightEAR) / 2;
    };

    const getEyeAspectRatio = (eye) => {
      const vertical1 = distance(eye[1], eye[5]);
      const vertical2 = distance(eye[2], eye[4]);
      const horizontal = distance(eye[0], eye[3]);
      return (vertical1 + vertical2) / (2.0 * horizontal);
    };

    const distance = (point1, point2) => {
      const dx = point1.x - point2.x;
      const dy = point1.y - point2.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const calculateHeadPose = (landmarks) => {
      const nose = landmarks.getNose();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      const jawline = landmarks.getJawOutline();

      // Calculate yaw (left/right head turn)
      const eyeCenter = {
        x: (leftEye[0].x + rightEye[3].x) / 2,
        y: (leftEye[0].y + rightEye[3].y) / 2
      };
      const noseCenter = nose[3];
      const yaw = Math.round((noseCenter.x - eyeCenter.x) * 0.5);

      // Calculate pitch (up/down head tilt)
      const eyeY = eyeCenter.y;
      const noseY = noseCenter.y;
      const pitch = Math.round((noseY - eyeY) * 0.3);

      return { yaw, pitch };
    };

    const updateStatus = (status, confidence) => {
      setCurrentStatus(status);
      
      if (onStatusChange) {
        onStatusChange({
          status,
          confidence,
          timestamp: new Date().toISOString()
        });
      }
    };

    const captureFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 320, 240);

      const frame = canvas.toDataURL('image/jpeg', 0.3);

      if (frame.length > 2000 && onFrameCapture) {
        onFrameCapture(frame);
      }
    };

    startCamera();

    return () => {
      console.log('🧹 Cleaning up student camera');
      mounted = false;
      
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [modelsLoaded, onStatusChange, onFrameCapture]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scaleX(-1)'
        }}
      />
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {/* Status Indicator */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        padding: '6px 12px',
        backgroundColor: 
          currentStatus === 'attentive' ? '#22c55e' :
          currentStatus === 'drowsy' ? '#f59e0b' :
          currentStatus === 'looking_away' ? '#ef4444' : '#6b7280',
        color: 'white',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase'
      }}>
        {currentStatus === 'attentive' ? '✅ Attentive' :
         currentStatus === 'drowsy' ? '😴 Drowsy' :
         currentStatus === 'looking_away' ? '👀 Looking Away' : '❓ No Face'}
      </div>
    </div>
  );
}