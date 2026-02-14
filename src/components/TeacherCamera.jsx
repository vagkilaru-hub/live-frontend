import { useEffect, useRef, useState } from 'react';

export default function TeacherCamera({ onClose, wsManager }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const streamRef = useRef(null);
    const frameIntervalRef = useRef(null);

    useEffect(() => {
        async function startCamera() {
            try {
                console.log('🎥 Starting teacher camera...');

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    },
                    audio: false
                });

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setIsActive(true);
                    console.log('✅ Teacher camera active');

                    // Setup canvas
                    const canvas = canvasRef.current;
                    canvas.width = 640;
                    canvas.height = 480;

                    // Send frames to students every 1 second
                    frameIntervalRef.current = setInterval(() => {
                        if (!videoRef.current || videoRef.current.paused) return;

                        try {
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(videoRef.current, 0, 0, 640, 480);
                            const frameData = canvas.toDataURL('image/jpeg', 0.7);

                            // Send to students via WebSocket
                            if (wsManager && wsManager.isConnected()) {
                                wsManager.send({
                                    type: 'teacher_camera_frame',
                                    frame: frameData
                                });
                            }
                        } catch (err) {
                            console.error('Frame capture error:', err);
                        }
                    }, 1000);
                }
            } catch (err) {
                console.error('❌ Teacher camera error:', err);
                alert('Could not access camera. Please allow camera permission.');
            }
        }

        startCamera();

        return () => {
            console.log('🛑 Stopping teacher camera');
            if (frameIntervalRef.current) {
                clearInterval(frameIntervalRef.current);
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [wsManager]);

    return (
        <div style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            width: '320px',
            zIndex: 2000,
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
            border: '3px solid #8b5cf6',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>📹</span>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: '600' }}>
                            My Camera
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.9 }}>
                            Broadcasting to students
                        </div>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                >
                    ✕
                </button>
            </div>

            {/* Video */}
            <div style={{ position: 'relative', backgroundColor: '#000' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                        width: '100%',
                        height: 'auto',
                        transform: 'scaleX(-1)',
                        display: 'block',
                    }}
                />

                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {isActive && (
                    <div style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        padding: '6px 12px',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
                    }}>
                        <div style={{
                            width: '6px',
                            height: '6px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            animation: 'pulse 2s ease-in-out infinite',
                        }} />
                        LIVE
                    </div>
                )}

                {!isActive && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '600',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📹</div>
                            Starting...
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '8px 12px',
                backgroundColor: '#dcfce7',
                fontSize: '11px',
                color: '#166534',
                textAlign: 'center',
                fontWeight: '600',
            }}>
                ✓ Students see you in their main view
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