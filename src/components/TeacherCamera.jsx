import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [frameCount, setFrameCount] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    console.log('🎬 TeacherCamera mounted');
    console.log('📡 WebSocket status:', wsManager?.isConnected());

    const startStreaming = async () => {
      try {
        // Get camera
        console.log('📹 Requesting camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: false
        });

        console.log('✅ Camera granted');
        
        const video = videoRef.current;
        if (!video) {
          console.error('❌ No video element');
          return;
        }

        video.srcObject = stream;
        streamRef.current = stream;

        // Wait for video to load
        video.onloadedmetadata = () => {
          console.log('📺 Video metadata loaded');
          video.play().then(() => {
            console.log('▶️ Video playing');
            
            // Wait 1 second then start interval
            setTimeout(() => {
              console.log('⏰ Starting interval...');
              
              intervalRef.current = setInterval(() => {
                captureFrame();
              }, 500);
              
              console.log('✅ Interval started:', intervalRef.current);
            }, 1000);
          });
        };

      } catch (err) {
        console.error('❌ Camera error:', err);
        alert('Camera access denied!');
      }
    };

    const captureFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        console.error('❌ Missing refs');
        return;
      }

      if (!wsManager || !wsManager.isConnected()) {
        console.error('❌ WebSocket not connected');
        return;
      }

      if (video.readyState !== 4) {
        console.warn('⚠️ Video not ready:', video.readyState);
        return;
      }

      // Capture frame
      const ctx = canvas.getContext('2d');
      canvas.width = 480;
      canvas.height = 270;
      ctx.drawImage(video, 0, 0, 480, 270);

      const frameData = canvas.toDataURL('image/jpeg', 0.5);

      if (frameData.length < 3000) {
        console.error('❌ Frame too small:', frameData.length);
        return;
      }

      // Send via WebSocket
      try {
        wsManager.send({
          type: 'teacher_camera_frame',
          frame: frameData
        });
        
        setFrameCount(prev => {
          const newCount = prev + 1;
          if (newCount % 5 === 0) {
            console.log(`✅ Sent ${newCount} frames`);
          }
          return newCount;
        });
      } catch (err) {
        console.error('❌ Send error:', err);
      }
    };

    startStreaming();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up...');
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('⏹️ Interval cleared');
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        console.log('📹 Camera stopped');
      }

      if (wsManager?.isConnected()) {
        wsManager.send({ type: 'teacher_camera_stopped' });
        console.log('📤 Stop signal sent');
      }
    };
  }, [wsManager]);

  const handleClose = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (wsManager?.isConnected()) {
      wsManager.send({ type: 'teacher_camera_stopped' });
    }
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
      width: '400px'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#8b5cf6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          color: 'white',
          fontWeight: '600',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          📹 My Camera
          <span style={{
            fontSize: '10px',
            padding: '2px 8px',
            backgroundColor: frameCount > 0 ? '#22c55e' : '#ef4444',
            borderRadius: '12px',
            fontWeight: '700'
          }}>
            ● LIVE ({frameCount})
          </span>
        </div>
        <button onClick={handleClose} style={{
          padding: '4px 8px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer'
        }}>
          ✕
        </button>
      </div>

      {/* Video */}
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

      {/* Hidden canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Status */}
      <div style={{
        padding: '8px',
        backgroundColor: frameCount > 0 ? '#22c55e' : '#f59e0b',
        color: 'white',
        fontSize: '11px',
        fontWeight: '600',
        textAlign: 'center'
      }}>
        {frameCount > 0 ? `✓ Streaming (${frameCount} frames sent)` : '⏳ Starting...'}
      </div>
    </div>
  );
}