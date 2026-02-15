import { useEffect, useRef, useState } from 'react';
import { initializeMediaPipe, extractAttentionFeatures } from '../utils/mediapipe';

export default function StudentCamera({ onStatusChange, onFrameCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('attentive');
  const [isActive, setIsActive] = useState(false);
  const [detectionCount, setDetectionCount] = useState(0);
  
  const statusRef = useRef('attentive');
  const frameIntervalRef = useRef(null);
  const mediaPipeRef = useRef(null);
  const eyeClosedFrames = useRef(0);
  const lookingAwayFrames = useRef(0);

  // Detection thresholds
  const THRESHOLDS = {
    EYE_CLOSED: 0.15,        // EAR below this = eyes closed
    EYE_OPEN: 0.20,          // EAR above this = eyes open
    DROWSY_FRAMES: 6,        // Closed for 2 seconds (at ~3 fps) = drowsy
    HEAD_YAW_MAX: 15,        // Max head turn left/right (degrees)
    HEAD_PITCH_MAX: 15,      // Max head tilt up/down (degrees)
    LOOKING_AWAY_FRAMES: 3   // Looking away for 1 second = alert
  };

  useEffect(() => {
    let mounted = true;
    let stream = null;

    const initializeCamera = async () => {
      try {
        console.log('🎥 Starting camera with REAL detection...');
        
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 640, 
            height: 480,
            facingMode: 'user'
          } 
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              console.log('✅ Camera started');
              setIsActive(true);
              
              // Initialize MediaPipe Face Detection
              await initializeMediaPipeDetection();
              
              // Start frame capture for teacher
              startFrameCapture();
              
            } catch (err) {
              console.error('❌ Error playing video:', err);
            }
          };
        }

      } catch (error) {
        console.error('❌ Camera error:', error);
        alert('Camera permission denied: ' + error.message);
      }
    };

    const initializeMediaPipeDetection = async () => {
      try {
        console.log('🧠 Initializing MediaPipe Face Detection...');
        
        const { faceMesh, camera } = await initializeMediaPipe(
          videoRef.current,
          onMediaPipeResults
        );
        
        mediaPipeRef.current = { faceMesh, camera };
        console.log('✅ MediaPipe initialized successfully');
        
      } catch (error) {
        console.error('❌ MediaPipe initialization failed:', error);
        console.warn('⚠️ Falling back to no detection mode');
      }
    };

    const onMediaPipeResults = (results) => {
      if (!mounted) return;
      
      // Draw the detection on canvas
      drawDetection(results);
      
      // Extract features and classify
      const features = extractAttentionFeatures(results);
      
      if (!features) {
        // No face detected
        updateStatus('no_face', 0);
        return;
      }

      // Analyze the features
      const detectionResult = analyzeAttention(features);
      updateStatus(detectionResult.status, detectionResult.confidence);
      
      // Increment detection counter
      setDetectionCount(prev => prev + 1);
    };

    const analyzeAttention = (features) => {
      const { eye_aspect_ratio, head_pose } = features;
      
      console.log('📊 Detection:', {
        EAR: eye_aspect_ratio.toFixed(3),
        Yaw: head_pose.yaw,
        Pitch: head_pose.pitch
      });

      // Check for drowsiness (eyes closed)
      if (eye_aspect_ratio < THRESHOLDS.EYE_CLOSED) {
        eyeClosedFrames.current++;
        lookingAwayFrames.current = 0; // Reset looking away counter
        
        if (eyeClosedFrames.current >= THRESHOLDS.DROWSY_FRAMES) {
          console.log('😴 DROWSY detected - eyes closed for', eyeClosedFrames.current, 'frames');
          return { status: 'drowsy', confidence: 0.9 };
        }
      } else if (eye_aspect_ratio > THRESHOLDS.EYE_OPEN) {
        eyeClosedFrames.current = 0; // Reset
      }

      // Check for looking away (head pose)
      const isLookingAway = 
        Math.abs(head_pose.yaw) > THRESHOLDS.HEAD_YAW_MAX ||
        Math.abs(head_pose.pitch) > THRESHOLDS.HEAD_PITCH_MAX;

      if (isLookingAway) {
        lookingAwayFrames.current++;
        eyeClosedFrames.current = 0; // Reset drowsy counter
        
        if (lookingAwayFrames.current >= THRESHOLDS.LOOKING_AWAY_FRAMES) {
          console.log('👀 LOOKING AWAY detected - Yaw:', head_pose.yaw, 'Pitch:', head_pose.pitch);
          return { status: 'looking_away', confidence: 0.85 };
        }
      } else {
        lookingAwayFrames.current = 0; // Reset
      }

      // Check if returning to attentive after being distracted
      if (eyeClosedFrames.current === 0 && lookingAwayFrames.current === 0) {
        if (statusRef.current !== 'attentive') {
          console.log('✅ ATTENTIVE - student refocused');
        }
        return { status: 'attentive', confidence: 0.95 };
      }

      // Default: maintain current status if transitioning
      return { status: statusRef.current, confidence: 0.7 };
    };

    const updateStatus = (newStatus, confidence) => {
      if (newStatus !== statusRef.current) {
        console.log('🔄 Status changed:', statusRef.current, '→', newStatus, `(${(confidence * 100).toFixed(0)}%)`);
        
        statusRef.current = newStatus;
        setStatus(newStatus);
        
        // Send to server
        if (onStatusChange) {
          onStatusChange({
            status: newStatus,
            confidence: confidence,
            timestamp: Date.now()
          });
          console.log('📤 Sent to server:', newStatus);
        }
      }
    };

    const drawDetection = (results) => {
      if (!canvasRef.current || !videoRef.current) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;

      // Set canvas size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw mirrored video
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw face mesh if available
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Draw key points
        ctx.fillStyle = '#00FF00';
        const keyPoints = [
          1,    // Nose tip
          33,   // Left eye left corner
          133,  // Left eye right corner
          362,  // Right eye left corner
          263,  // Right eye right corner
          152   // Chin
        ];

        keyPoints.forEach(idx => {
          const point = landmarks[idx];
          const x = canvas.width - (point.x * canvas.width); // Mirror
          const y = point.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
    };

    const startFrameCapture = () => {
      // Capture frames for teacher every 2 seconds
      frameIntervalRef.current = setInterval(() => {
        captureFrame();
      }, 2000);
    };

    const captureFrame = () => {
      if (!canvasRef.current) return;
      
      try {
        const frameData = canvasRef.current.toDataURL('image/jpeg', 0.7);
        if (onFrameCapture && frameData) {
          onFrameCapture(frameData);
        }
      } catch (err) {
        console.error('Frame capture error:', err);
      }
    };

    initializeCamera();

    return () => {
      mounted = false;
      console.log('🛑 Stopping camera and detection');
      
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      
      if (mediaPipeRef.current && mediaPipeRef.current.camera) {
        mediaPipeRef.current.camera.stop();
      }
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onStatusChange, onFrameCapture]);

  const getStatusColor = () => {
    switch (status) {
      case 'attentive': return '#22c55e';
      case 'looking_away': return '#f59e0b';
      case 'drowsy': return '#ef4444';
      case 'no_face': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'attentive': return '✓ ATTENTIVE';
      case 'looking_away': return '👀 LOOKING AWAY';
      case 'drowsy': return '😴 DROWSY';
      case 'no_face': return '❌ NO FACE';
      default: return 'DETECTING...';
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        autoPlay
        muted
      />
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: '#000',
        }}
      />
      
      {/* Status Bar at Bottom */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        padding: '10px',
        backgroundColor: getStatusColor(),
        color: 'white',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: '700',
        letterSpacing: '1px',
      }}>
        {getStatusText()}
      </div>

      {/* Detection Counter */}
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        padding: '6px 12px',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: '#fff',
        borderRadius: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
      }}>
        Detections: {detectionCount} | {isActive ? '🧠 AI ACTIVE' : '⏳ Loading...'}
      </div>

      {/* Loading Overlay */}
      {!isActive && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          fontSize: '16px',
          fontWeight: '600',
          gap: '16px',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #fff',
            borderTop: '4px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <div>Starting AI detection...</div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}