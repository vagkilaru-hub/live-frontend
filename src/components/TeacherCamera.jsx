import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameCounterRef = useRef(0);

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
          width: { ideal: 640 },   // ✅ Reduced from 1280
          height: { ideal: 360 },  // ✅ Reduced from 720
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

      // Wait for video to be ready
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

      setIsCameraOn(true);
      setIsStreaming(true);
      setError(null);
      console.log('✅ Teacher camera started');

      // ✅ Capture frames every 300ms (~3 FPS) - Optimized
      frameIntervalRef.current = setInterval(() => {
        captureAndSendFrame();
      }, 300);

    } catch (error) {
      console.error('❌ Error accessing camera:', error);
      setError('Could not access camera. Please check permissions.');
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

    // ✅ Skip frames to reduce load
    frameCounterRef.current++;
    if (frameCounterRef.current % 2 !== 0) {
      return;
    }

    const context = canvas.getContext('2d');
    
    // ✅ Use smaller resolution
    canvas.width = 480;
    canvas.height = 270;

    try {
      // Draw scaled frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // ✅ Lower quality for smaller file size
      const frameData = canvas.toDataURL('image/jpeg', 0.4);

      // Send to backend
      if (frameData && frameData.length > 3000) {
        wsManager.send({
          type: 'teacher_camera_frame',
          frame: frameData
        });
        
        // Log occasionally
        if (Math.random() < 0.03) {
          console.log('📹 Streaming:', Math.round(frameData.length / 1024), 'KB');
        }
      }
    } catch (err) {
      console.error('❌ Frame error:', err);
    }
  };

  const stopCamera = () => {
    console.log('🛑 Stopping teacher camera...');
    
    setIsStreaming(false);

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOn(false);

    if (wsManager?.isConnected()) {
      wsManager.send({
        type: 'teacher_camera_stopped',
        data: {}
      });
      console.log('📤 Camera stopped signal sent');
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 2000,
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        width: isMinimized ? '280px' : '400px',
        transition: 'all 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#8b5cf6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            📹 My Camera
            {isStreaming && (
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                backgroundColor: '#ef4444',
                borderRadius: '12px',
                fontWeight: '700',
              }}>
                ● LIVE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={toggleMinimize}
              style={{
                padding: '4px 8px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {isMinimized ? '⬆' : '⬇'}
            </button>

            <button
              onClick={handleClose}
              style={{
                padding: '4px 8px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Video */}
        {!isMinimized && (
          <div style={{ position: 'relative' }}>
            {error ? (
              <div style={{
                padding: '40px 20px',
                backgroundColor: '#fee2e2',
                textAlign: 'center',
                color: '#991b1b',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{error}</div>
                <button onClick={startCamera} style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}>
                  Try Again
                </button>
              </div>
            ) : (
              <>
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
                    transform: 'scaleX(-1)',
                  }}
                />
                
                {isStreaming && (
                  <>
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      left: '12px',
                      padding: '6px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.95)',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        animation: 'pulse 2s ease-in-out infinite',
                      }} />
                      STREAMING
                    </div>

                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      right: '12px',
                      padding: '8px',
                      backgroundColor: 'rgba(34, 197, 94, 0.95)',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      textAlign: 'center',
                    }}>
                      ✓ Students can see
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}