import { useEffect, useRef, forwardRef } from 'react';

const VideoCapture = forwardRef(({ onVideoReady, isActive, showMirror = true }, ref) => {
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });

        streamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        if (ref) {
          if (typeof ref === 'function') {
            ref(localVideoRef.current);
          } else {
            ref.current = localVideoRef.current;
          }
        }

        if (onVideoReady) {
          onVideoReady(localVideoRef.current);
        }

        console.log('Camera started successfully');
      } catch (err) {
        console.error('Error accessing camera:', err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, onVideoReady, ref]);

  return (
    <video
      ref={localVideoRef}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: 'auto',
        transform: showMirror ? 'scaleX(-1)' : 'none',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}
    />
  );
});

VideoCapture.displayName = 'VideoCapture';

export default VideoCapture;