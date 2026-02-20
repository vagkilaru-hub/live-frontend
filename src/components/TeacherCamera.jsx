import { useState, useRef, useEffect } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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
        }, 
        audio: false 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsCameraOn(true);
        setError(null);
        console.log('✅ Teacher camera started');
      }
    } catch (error) {
      console.error('❌ Error accessing camera:', error);
      setError('Could not access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      console.log('🛑 Stopping teacher camera...');
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Track stopped:', track.kind);
      });
      streamRef.current = null;
      setIsCameraOn(false);
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
      bottom: isMinimized ? '20px' : '20px',
      right: '20px',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* Camera Container */}
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
            {isCameraOn && (
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                backgroundColor: '#22c55e',
                borderRadius: '12px',
              }}>
                ● LIVE
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Minimize Button */}
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
                fontWeight: '600',
              }}
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? '⬆' : '⬇'}
            </button>

            {/* Close Button */}
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
                fontWeight: '600',
              }}
              title="Close camera"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Video Area */}
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
                <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px' }}>
                  {error}
                </div>
                <button
                  onClick={startCamera}
                  style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                  }}
                >
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
                  }}
                />
                
                {/* Status Indicator */}
                {isCameraOn && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    padding: '6px 12px',
                    backgroundColor: 'rgba(34, 197, 94, 0.9)',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
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
                    LIVE
                  </div>
                )}
              </>
            )}
          </div>
        )}
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