import { useEffect, useRef, useState } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      console.log('📹 Starting teacher camera...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      if (!videoRef.current) {
        console.error('❌ Video ref not found');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      // Wait for video to load
      await new Promise((resolve) => {
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            console.log('✅ Video playing:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
            resolve();
          } catch (err) {
            console.error('❌ Play error:', err);
            resolve();
          }
        };
      });

      // Wait for first frame
      await new Promise(resolve => setTimeout(resolve, 1000));

      setIsStreaming(true);
      console.log('✅ Starting frame capture to students');

      // Start streaming to students
      frameIntervalRef.current = setInterval(() => {
        captureAndSendFrame();
      }, 100); // 10 FPS

    } catch (error) {
      console.error('❌ Camera error:', error);
      alert('Could not access camera: ' + error.message);
    }
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !wsManager?.isConnected()) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check video is ready
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    if (video.readyState < 2) {
      return;
    }

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      // Draw current frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to JPEG
      const frameData = canvas.toDataURL('image/jpeg', 0.7);

      // Send to students via WebSocket
      if (frameData && frameData.length > 5000) {
        wsManager.send({
          type: 'teacher_camera_frame',
          frame: frameData
        });
      }
    } catch (err) {
      console.error('❌ Frame capture error:', err);
    }
  };

  const stopCamera = () => {
    console.log('🛑 Stopping teacher camera stream');
    
    setIsStreaming(false);

    // Stop frame capture
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Notify students camera stopped
    if (wsManager?.isConnected()) {
      wsManager.send({
        type: 'teacher_camera_stopped'
      });
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'white',
      borderRadius: '20px',
      padding: '24px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      zIndex: 1000,
      maxWidth: '90vw',
      maxHeight: '90vh',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <h3 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#111827',
          margin: 0,
        }}>
          📹 My Camera {isStreaming && '(Streaming to Students)'}
        </h3>
        <button
          onClick={handleClose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Video Display */}
      <div style={{
        position: 'relative',
        width: '640px',
        height: '480px',
        backgroundColor: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)', // Mirror effect
          }}
        />

        {/* Streaming indicator */}
        {isStreaming && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            padding: '8px 16px',
            backgroundColor: '#ef4444',
            color: 'white',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              backgroundColor: 'white',
              borderRadius: '50%',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            LIVE TO STUDENTS
          </div>
        )}
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Info */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        backgroundColor: '#f0fdf4',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#166534',
        textAlign: 'center',
      }}>
        {isStreaming 
          ? '✓ Your camera is streaming to all students' 
          : '⏳ Preparing camera...'}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}