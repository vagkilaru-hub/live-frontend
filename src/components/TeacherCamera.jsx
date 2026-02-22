import { useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    console.log('🎬🎬🎬 TEACHER CAMERA STARTING 🎬🎬🎬');
    
    let stream = null;
    let interval = null;

    // Start camera
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(mediaStream => {
        console.log('✅ CAMERA ACCESS GRANTED');
        stream = mediaStream;
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = () => {
          console.log('📺 VIDEO READY');
          videoRef.current.play();
          
          // Start sending frames after 2 seconds
          setTimeout(() => {
            console.log('⏰ STARTING FRAME INTERVAL');
            
            interval = setInterval(() => {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              
              if (!video || !canvas || !wsManager) return;
              
              canvas.width = 480;
              canvas.height = 270;
              canvas.getContext('2d').drawImage(video, 0, 0, 480, 270);
              
              const frame = canvas.toDataURL('image/jpeg', 0.5);
              
              if (frame.length > 3000) {
                wsManager.send({
                  type: 'teacher_camera_frame',
                  frame: frame
                });
                console.log('✅✅✅ FRAME SENT:', frame.length, 'bytes');
              }
            }, 500);
            
            console.log('✅ INTERVAL ID:', interval);
          }, 2000);
        };
      })
      .catch(err => {
        console.error('❌ CAMERA ERROR:', err);
        alert('Camera failed: ' + err.message);
      });

    // Cleanup
    return () => {
      console.log('🧹 CLEANUP');
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (wsManager) wsManager.send({ type: 'teacher_camera_stopped' });
    };
  }, [wsManager]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      padding: '16px',
      width: '400px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>📹 My Camera</h3>
        <button
          onClick={() => {
            console.log('❌ CLOSE BUTTON CLICKED');
            onClose();
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Close
        </button>
      </div>
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          borderRadius: '8px',
          backgroundColor: '#000',
          transform: 'scaleX(-1)'
        }}
      />
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div style={{
        marginTop: '12px',
        padding: '8px',
        backgroundColor: '#22c55e',
        color: 'white',
        borderRadius: '8px',
        textAlign: 'center',
        fontWeight: '600',
        fontSize: '12px'
      }}>
        ● LIVE - Check console for logs
      </div>
    </div>
  );
}