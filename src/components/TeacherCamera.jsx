import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [frameCount, setFrameCount] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    console.log('🎬 Teacher camera starting');

    let mounted = true;

    const startCamera = async () => {
      try {
        // ✅ Lower resolution for better performance
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 270 },
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        console.log('✅ Camera granted');

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) return;

        video.srcObject = stream;
        streamRef.current = stream;

        video.onloadedmetadata = () => {
          video.play().then(() => {
            console.log('▶️ Video playing');

            setTimeout(() => {
              if (!mounted) return;

              intervalRef.current = setInterval(() => {
                if (!videoRef.current || !canvasRef.current || !wsManager?.isConnected()) {
                  return;
                }

                const v = videoRef.current;
                const c = canvasRef.current;

                if (v.readyState !== 4) return;

                // ✅ Smaller canvas size
                c.width = 320;
                c.height = 180;
                const ctx = c.getContext('2d');
                ctx.drawImage(v, 0, 0, 320, 180);

                // ✅ Lower quality (30%)
                const frame = c.toDataURL('image/jpeg', 0.3);

                if (frame.length < 3000) return;

                try {
                  wsManager.send({
                    type: 'teacher_camera_frame',
                    frame: frame
                  });

                  setFrameCount(prev => {
                    const newCount = prev + 1;
                    if (newCount % 5 === 0) {
                      console.log(`✅ Sent ${newCount} frames`);
                    }
                    return newCount;
                  });
                } catch (err) {
                  console.error('Send error:', err);
                }
              }, 1000); // ✅ 1 frame per second (was 500ms)

              console.log('✅ Streaming started');
            }, 1000);
          });
        };

      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();

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
      zIndex: 9999,
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      width: '400px'
    }}>
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
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
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

      <div style={{
        padding: '8px',
        backgroundColor: frameCount > 0 ? '#22c55e' : '#f59e0b',
        color: 'white',
        fontSize: '11px',
        fontWeight: '600',
        textAlign: 'center'
      }}>
        {frameCount > 0 ? `✓ Streaming (${frameCount} frames)` : '⏳ Starting...'}
      </div>
    </div>
  );
}