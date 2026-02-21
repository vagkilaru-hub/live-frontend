import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const frameCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        console.log('📹 Requesting camera access...');
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        console.log('✅ Camera access granted');
        
        const video = videoRef.current;
        video.srcObject = stream;
        streamRef.current = stream;

        // Wait for video ready
        video.onloadedmetadata = () => {
          video.play().then(() => {
            console.log('✅ Video playing:', video.videoWidth, 'x', video.videoHeight);
            
            setTimeout(() => {
              if (!mounted) return;
              
              setIsStreaming(true);
              console.log('🎬 Starting frame capture interval...');
              
              // Send frames every 500ms
              intervalRef.current = setInterval(() => {
                if (!wsManager?.isConnected()) {
                  console.warn('⚠️ WebSocket not connected');
                  return;
                }

                const canvas = canvasRef.current;
                if (!canvas) {
                  console.warn('⚠️ No canvas');
                  return;
                }

                const ctx = canvas.getContext('2d');
                canvas.width = 480;
                canvas.height = 270;

                ctx.drawImage(video, 0, 0, 480, 270);
                const frameData = canvas.toDataURL('image/jpeg', 0.5);

                if (frameData && frameData.length > 3000) {
                  wsManager.send({
                    type: 'teacher_camera_frame',
                    frame: frameData
                  });
                  
                  frameCountRef.current++;
                  if (frameCountRef.current % 10 === 0) {
                    console.log(`✅ Sent ${frameCountRef.current} frames`);
                  }
                }
              }, 500);
              
            }, 1000);
          });
        };

      } catch (err) {
        console.error('❌ Camera error:', err);
        alert('Camera access denied');
      }
    };

    init();

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (wsManager?.isConnected()) {
        wsManager.send({ type: 'teacher_camera_stopped' });
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
        <div style={{ color: 'white', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📹 My Camera
          {isStreaming && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              backgroundColor: '#ef4444',
              borderRadius: '12px',
              fontWeight: '700'
            }}>
              ● LIVE ({frameCountRef.current})
            </span>
          )}
        </div>
        <button onClick={handleClose} style={{
          padding: '4px 8px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px'
        }}>
          ✕
        </button>
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

      {isStreaming && (
        <div style={{
          padding: '8px',
          backgroundColor: '#22c55e',
          color: 'white',
          fontSize: '11px',
          fontWeight: '600',
          textAlign: 'center'
        }}>
          ✓ Streaming to students - Frame #{frameCountRef.current}
        </div>
      )}
    </div>
  );
}