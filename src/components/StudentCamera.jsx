import { useEffect, useRef, useState } from 'react';

export default function StudentCamera({ onStatusChange, onFrameCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('attentive');
  const [isActive, setIsActive] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  
  const statusRef = useRef('attentive');
  const intervalRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const drawIntervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let stream = null;

    const initializeCamera = async () => {
      try {
        console.log('🎥 Starting camera...');
        
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
          
          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().then(() => {
              console.log('✅ Camera started and playing');
              setIsActive(true);
              
              // Start drawing video to canvas continuously
              startDrawing();
              
              // Start auto-cycling detection
              startDetection();
            }).catch(err => {
              console.error('❌ Error playing video:', err);
            });
          };
        }

      } catch (error) {
        console.error('❌ Camera error:', error);
        alert('Camera permission denied: ' + error.message);
      }
    };

    const startDrawing = () => {
      // Draw video to canvas 30 times per second
      drawIntervalRef.current = setInterval(() => {
        drawFrame();
      }, 33); // ~30 FPS
    };

    const drawFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;
      if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const startDetection = () => {
      // Send initial status
      if (onStatusChange) {
        onStatusChange({
          status: 'attentive',
          ear: 0.25,
          nose_x: 0.5,
          nose_y: 0.5,
          timestamp: Date.now()
        });
        console.log('📤 Initial status sent: attentive');
      }

      // Auto-cycle every 10 seconds for testing
      intervalRef.current = setInterval(() => {
        const states = ['attentive', 'looking_away', 'attentive', 'looking_away', 'drowsy', 'attentive'];
        const index = cycleCount % states.length;
        const newStatus = states[index];
        
        console.log('═══════════════════════════════════════');
        console.log('🔄 AUTO STATUS CHANGE:', statusRef.current, '→', newStatus);
        console.log('Cycle:', cycleCount + 1, '/', states.length);
        console.log('═══════════════════════════════════════');
        
        statusRef.current = newStatus;
        setStatus(newStatus);
        setCycleCount(prev => prev + 1);
        
        // SEND TO SERVER IMMEDIATELY
        if (onStatusChange) {
          onStatusChange({
            status: newStatus,
            ear: 0.25,
            nose_x: 0.5,
            nose_y: 0.5,
            timestamp: Date.now()
          });
          console.log('📤 SENT TO SERVER:', newStatus);
        }
      }, 10000); // Every 10 seconds

      // Frame capture every 2 seconds
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
      console.log('🛑 Stopping camera');
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }

      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
      }
      
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onStatusChange, onFrameCapture, cycleCount]);

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
        width={640}
        height={480}
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

      {/* Cycle Counter */}
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
        Cycle: {cycleCount} | {isActive ? '📹 LIVE' : '⏳ Loading...'}
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
          <div>Starting camera...</div>
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