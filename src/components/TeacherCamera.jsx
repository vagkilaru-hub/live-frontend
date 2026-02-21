import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360 },
        audio: false
      });

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      await new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          resolve();
        };
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      setIsStreaming(true);
      
      // Send frames every 300ms
      intervalRef.current = setInterval(() => {
        sendFrame();
      }, 300);

    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const sendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !wsManager?.isConnected()) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.readyState < 2) return;

    canvas.width = 480;
    canvas.height = 270;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 480, 270);

    const frame = canvas.toDataURL('image/jpeg', 0.4);

    if (frame && frame.length > 3000) {
      wsManager.send({
        type: 'teacher_camera_frame',
        frame: frame
      });
    }
  };

  const stopCamera = () => {
    setIsStreaming(false);
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

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
      bottom: '20px',
      right: '20px',
      zIndex: 2000,
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      width: '400px'
    }}>
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#8b5cf6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>
          📹 My Camera {isStreaming && <span style={{
            fontSize: '10px',
            padding: '2px 8px',
            backgroundColor: '#ef4444',
            borderRadius: '12px',
            marginLeft: '8px'
          }}>● LIVE</span>}
        </div>
        <button onClick={handleClose} style={{
          padding: '4px 8px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}>✕</button>
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          backgroundColor: '#000',
          aspectRatio: '16/9',
          display: 'block',
          transform: 'scaleX(-1)'
        }}
      />

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}