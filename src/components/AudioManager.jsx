import { useEffect, useRef, useState } from 'react';

export default function AudioManager({ wsManager, userId, userType, onStatusChange }) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(true);

    const localStreamRef = useRef(null);

    const startAudio = async () => {
        try {
            console.log('🎤 Starting audio...');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            localStreamRef.current = stream;
            setIsEnabled(true);
            setIsMuted(false);

            if (onStatusChange) {
                onStatusChange({ enabled: true, muted: false, connected: false });
            }

            console.log('✅ Microphone enabled');
            alert('Microphone enabled! Note: Audio streaming requires WebRTC implementation.');
        } catch (error) {
            console.error('❌ Audio error:', error);
            alert('Could not access microphone. Please check browser permissions.');
        }
    };

    const stopAudio = () => {
        console.log('🛑 Stopping audio');

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        setIsEnabled(false);
        setIsMuted(true);

        if (onStatusChange) {
            onStatusChange({ enabled: false, muted: true, connected: false });
        }
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = isMuted;
            });
            setIsMuted(!isMuted);
            console.log(`🎤 ${isMuted ? 'Unmuted' : 'Muted'}`);

            if (onStatusChange) {
                onStatusChange({ enabled: isEnabled, muted: !isMuted, connected: false });
            }
        }
    };

    useEffect(() => {
        return () => {
            stopAudio();
        };
    }, []);

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
                onClick={isEnabled ? stopAudio : startAudio}
                style={{
                    padding: '8px 16px',
                    backgroundColor: isEnabled ? '#22c55e' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                🎤 {isEnabled ? 'Audio ON' : 'Audio OFF'}
            </button>

            {isEnabled && (
                <button
                    onClick={toggleMute}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: isMuted ? '#ef4444' : '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                    }}
                >
                    {isMuted ? '🔇 Muted' : '🔊 Speaking'}
                </button>
            )}
        </div>
    );
}