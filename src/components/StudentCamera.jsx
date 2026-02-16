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

  // RELAXED THRESHOLDS - Less strict, more tolerant
  const THRESHOLDS = {
    EYE_CLOSED: 0.12,        // Lower = harder to trigger (was 0.15)
    EYE_OPEN: 0.18,          // Eyes must be more open to reset (was 0.20)
    DROWSY_FRAMES: 9,        // 3 seconds of closed eyes needed (was 6 = 2 sec)
    HEAD_YAW_MAX: 35,        // Allow more head turn left/right (was 15°)
    HEAD_PITCH_MAX: 25,      // Allow more head tilt up/down (was 15°)
    LOOKING_AWAY_FRAMES: 6,  // 2 seconds looking away needed (was 3 = 1 sec)
    ATTENTIVE_THRESHOLD: 5   // Need 5 good frames to return to attentive
  };

  const attentiveFrames = useRef(0);

  useEffect(() => {
    let mounted = true;
    let stream = null;

    const initializeCamera = async () => {
      try {
        console.log('🎥 Starting camera with RELAXED detection...');
        
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
        console.log('🧠 Initializing MediaPipe (RELAXED mode)...');
        
        const { faceMesh, camera } = await initializeMediaPipe(
          videoRef.current,
          onMediaPipeResults
        );
        
        mediaPipeRef.current = { faceMesh, camera };
        console.log('✅ MediaPipe initialized - LESS STRICT detection active');
        
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
        Pitch: head_pose.pitch,
        Status: statusRef.current
      });

      // Check for drowsiness (eyes closed) - MORE STRICT
      if (eye_aspect_ratio < THRESHOLDS.EYE_CLOSED) {
        eyeClosedFrames.current++;
        lookingAwayFrames.current = 0;
        attentiveFrames.current = 0;
        
        if (eyeClosedFrames.current >= THRESHOLDS.DROWSY_FRAMES) {
          console.log('😴 DROWSY - eyes closed for', eyeClosedFrames.current, 'frames (3+ sec)');
          return { status: 'drowsy', confidence: 0.9 };
        } else {
          // Eyes closed but not long enough yet - stay in current state
          console.log('⏳ Eyes closing...', eyeClosedFrames.current, '/', THRESHOLDS.DROWSY_FRAMES);
          return { status: statusRef.current, confidence: 0.7 };
        }
      } else if (eye_aspect_ratio > THRESHOLDS.EYE_OPEN) {
        eyeClosedFrames.current = 0; // Reset drowsy counter
      }

      // Check for looking away (head pose) - LESS STRICT
      const isLookingAway = 
        Math.abs(head_pose.yaw) > THRESHOLDS.HEAD_YAW_MAX ||
        Math.abs(head_pose.pitch) > THRESHOLDS.HEAD_PITCH_MAX;

      if (isLookingAway) {
        lookingAwayFrames.current++;
        eyeClosedFrames.current = 0;
        attentiveFrames.current = 0;
        
        if (lookingAwayFrames.current >= THRESHOLDS.LOOKING_AWAY_FRAMES) {
          console.log('👀 LOOKING AWAY - Yaw:', head_pose.yaw, '° Pitch:', head_pose.pitch, '° (2+ sec)');
          return { status: 'looking_away', confidence: 0.85 };
        } else {
          // Head turning but not long enough yet
          console.log('⏳ Head turning...', lookingAwayFrames.current, '/', THRESHOLDS.LOOKING_AWAY_FRAMES);
          return { status: statusRef.current, confidence: 0.7 };
        }
      } else {
        lookingAwayFrames.current = 0; // Reset looking away counter
      }

      // Student is looking at camera with eyes open - check if should return to attentive
      if (eyeClosedFrames.current === 0 && lookingAwayFrames.current === 0) {
        attentiveFrames.current++;
        
        // Need multiple good frames before returning to attentive
        if (attentiveFrames.current >= THRESHOLDS.ATTENTIVE_THRESHOLD) {
          if (statusRef.current !== 'attentive') {
            console.log('✅ ATTENTIVE - student refocused after', THRESHOLDS.ATTENTIVE_THRESHOLD, 'good frames');
          }
          return { status: 'attentive', confidence: 0.95 };
        } else {
          // Still transitioning back to attentive
          return { status: statusRef.current, confidence: 0.8 };
        }
      }

      // Default: maintain current status
      return { status: statusRef.current, confidence: 0.7 };
    };

    const updateStatus = (newStatus, confidence) => {
      if (newStatus !== statusRef.current) {
        console.log('═══════════════════════════════════════');
        console.log('🔄 STATUS CHANGE:', statusRef.current, '→', newStatus);
        console.log('   Confidence:', (confidence * 100).toFixed(0) + '%');
        console.log('═══════════════════════════════════════');
        
        statusRef.current = newStatus;
        setStatus(newStatus);
        
        // Reset attentive counter when status changes
        if (newStatus !== 'attentive') {
          attentiveFrames.current = 0;
        }
        
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
        Detections: {detectionCount} | {isActive ? '🧠 RELAXED' : '⏳ Loading...'}
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