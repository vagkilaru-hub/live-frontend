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
  const attentiveFrames = useRef(0);

  // OPTIMIZED THRESHOLDS - Calibrated to reference images
  const THRESHOLDS = {
    // Eye Detection (for drowsiness)
    EYE_CLOSED: 0.10,        // Very low = eyes must be REALLY closed
    EYE_OPEN: 0.18,          // Clear threshold for open eyes
    DROWSY_FRAMES: 12,       // 4 seconds of closed eyes = drowsy (3 fps)
    
    // Head Pose Detection (for looking away)
    HEAD_YAW_EXTREME: 50,    // Profile view (like Image 4) = looking away
    HEAD_YAW_MODERATE: 30,   // Slightly turned but still acceptable
    HEAD_PITCH_DOWN: 20,     // Looking down threshold
    HEAD_PITCH_UP: 20,       // Looking up threshold
    
    // Frame consistency
    LOOKING_AWAY_FRAMES: 9,  // 3 seconds of head turn = looking away
    ATTENTIVE_FRAMES: 6,     // 2 seconds of good posture = attentive
  };

  useEffect(() => {
    let mounted = true;
    let stream = null;

    const initializeCamera = async () => {
      try {
        console.log('🎥 Starting OPTIMIZED detection (calibrated to reference)...');
        
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
              console.log('✅ Camera started with REFERENCE-CALIBRATED detection');
              setIsActive(true);
              
              await initializeMediaPipeDetection();
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
        console.log('🧠 Initializing MediaPipe (REFERENCE MODE)...');
        
        const { faceMesh, camera } = await initializeMediaPipe(
          videoRef.current,
          onMediaPipeResults
        );
        
        mediaPipeRef.current = { faceMesh, camera };
        console.log('✅ Detection calibrated to reference images');
        
      } catch (error) {
        console.error('❌ MediaPipe initialization failed:', error);
        console.warn('⚠️ Falling back to no detection mode');
      }
    };

    const onMediaPipeResults = (results) => {
      if (!mounted) return;
      
      drawDetection(results);
      const features = extractAttentionFeatures(results);
      
      if (!features) {
        updateStatus('no_face', 0);
        return;
      }

      const detectionResult = analyzeAttention(features);
      updateStatus(detectionResult.status, detectionResult.confidence);
      setDetectionCount(prev => prev + 1);
    };

    const analyzeAttention = (features) => {
      const { eye_aspect_ratio, head_pose } = features;
      
      console.log('📊 Detection:', {
        EAR: eye_aspect_ratio.toFixed(3),
        Yaw: head_pose.yaw + '°',
        Pitch: head_pose.pitch + '°',
        Current: statusRef.current
      });

      // PRIORITY 1: Check for DROWSINESS (Image 6 - eyes closed, face forward)
      // Eyes must be REALLY closed to trigger drowsy
      if (eye_aspect_ratio < THRESHOLDS.EYE_CLOSED) {
        eyeClosedFrames.current++;
        
        // Only trigger drowsy after sustained eye closure
        if (eyeClosedFrames.current >= THRESHOLDS.DROWSY_FRAMES) {
          console.log('😴 DROWSY DETECTED - Eyes closed for', (eyeClosedFrames.current / 3).toFixed(1), 'seconds');
          lookingAwayFrames.current = 0;
          attentiveFrames.current = 0;
          return { status: 'drowsy', confidence: 0.95 };
        } else {
          // Eyes closing but not long enough - maintain current state
          console.log('⏳ Eyes closing... ' + eyeClosedFrames.current + '/' + THRESHOLDS.DROWSY_FRAMES);
          return { status: statusRef.current, confidence: 0.7 };
        }
      } else if (eye_aspect_ratio > THRESHOLDS.EYE_OPEN) {
        // Eyes are clearly open - reset drowsy counter
        eyeClosedFrames.current = 0;
      }

      // PRIORITY 2: Check for LOOKING AWAY (Image 4 - head turned to side)
      // Use absolute values to detect turns in either direction
      const absYaw = Math.abs(head_pose.yaw);
      const absPitch = Math.abs(head_pose.pitch);
      
      // Extreme head turn (profile view like Image 4) = definitely looking away
      const isProfileView = absYaw > THRESHOLDS.HEAD_YAW_EXTREME;
      
      // Moderate head turn + looking up/down = looking away
      const isModeratelyTurned = absYaw > THRESHOLDS.HEAD_YAW_MODERATE;
      const isLookingUpOrDown = absPitch > THRESHOLDS.HEAD_PITCH_DOWN;
      
      const isLookingAway = isProfileView || (isModeratelyTurned && isLookingUpOrDown);

      if (isLookingAway) {
        lookingAwayFrames.current++;
        attentiveFrames.current = 0;
        
        if (lookingAwayFrames.current >= THRESHOLDS.LOOKING_AWAY_FRAMES) {
          console.log('👀 LOOKING AWAY - Yaw: ' + head_pose.yaw + '° Pitch: ' + head_pose.pitch + '° (' + (lookingAwayFrames.current / 3).toFixed(1) + 's)');
          eyeClosedFrames.current = 0;
          return { status: 'looking_away', confidence: 0.90 };
        } else {
          // Head turning but not sustained yet
          console.log('⏳ Head turning... ' + lookingAwayFrames.current + '/' + THRESHOLDS.LOOKING_AWAY_FRAMES);
          return { status: statusRef.current, confidence: 0.75 };
        }
      } else {
        // Head is facing forward - reset looking away counter
        lookingAwayFrames.current = 0;
      }

      // PRIORITY 3: ATTENTIVE (Image 5 - face forward, eyes open)
      // Student is looking at camera with eyes open
      if (eyeClosedFrames.current === 0 && lookingAwayFrames.current === 0) {
        attentiveFrames.current++;
        
        // Need sustained good behavior before confirming attentive
        if (attentiveFrames.current >= THRESHOLDS.ATTENTIVE_FRAMES) {
          if (statusRef.current !== 'attentive') {
            console.log('✅ ATTENTIVE - Face forward, eyes open for ' + (attentiveFrames.current / 3).toFixed(1) + 's');
          }
          return { status: 'attentive', confidence: 0.95 };
        } else {
          // Transitioning to attentive
          console.log('⏳ Returning to attentive... ' + attentiveFrames.current + '/' + THRESHOLDS.ATTENTIVE_FRAMES);
          return { status: statusRef.current, confidence: 0.80 };
        }
      }

      // Default: maintain current status
      return { status: statusRef.current, confidence: 0.70 };
    };

    const updateStatus = (newStatus, confidence) => {
      if (newStatus !== statusRef.current) {
        console.log('╔════════════════════════════════════════╗');
        console.log('║  STATUS CHANGE: ' + statusRef.current + ' → ' + newStatus);
        console.log('║  Confidence: ' + (confidence * 100).toFixed(0) + '%');
        console.log('╚════════════════════════════════════════╝');
        
        statusRef.current = newStatus;
        setStatus(newStatus);
        
        // Reset counters when status changes
        if (newStatus === 'attentive') {
          eyeClosedFrames.current = 0;
          lookingAwayFrames.current = 0;
        } else if (newStatus === 'drowsy') {
          lookingAwayFrames.current = 0;
          attentiveFrames.current = 0;
        } else if (newStatus === 'looking_away') {
          eyeClosedFrames.current = 0;
          attentiveFrames.current = 0;
        }
        
        // Send to server
        if (onStatusChange) {
          onStatusChange({
            status: newStatus,
            confidence: confidence,
            timestamp: Date.now()
          });
          console.log('📤 Sent to backend:', newStatus);
        }
      }
    };

    const drawDetection = (results) => {
      if (!canvasRef.current || !videoRef.current) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw mirrored video
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw face landmarks
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Draw key facial points
        ctx.fillStyle = '#00FF00';
        const keyPoints = [
          1,    // Nose tip
          33, 133,  // Left eye
          362, 263, // Right eye
          152   // Chin
        ];

        keyPoints.forEach(idx => {
          const point = landmarks[idx];
          const x = canvas.width - (point.x * canvas.width);
          const y = point.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Draw face oval outline
        ctx.strokeStyle = '#00FF0088';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
        faceOval.forEach((idx, i) => {
          const point = landmarks[idx];
          const x = canvas.width - (point.x * canvas.width);
          const y = point.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    };

    const startFrameCapture = () => {
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
      console.log('🛑 Stopping optimized detection');
      
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
      
      {/* Status Bar */}
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

      {/* Detection Info */}
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
        Detections: {detectionCount} | {isActive ? '🎯 OPTIMIZED' : '⏳ Loading...'}
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
          <div>Starting optimized AI...</div>
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