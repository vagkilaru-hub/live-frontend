import { useEffect, useRef, useState } from 'react';

export default function AudioManager({ wsManager, userId, userType, onStatusChange }) {
    const [isEnabled, setIsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [speakingUsers, setSpeakingUsers] = useState(new Set());

    const localStreamRef = useRef(null);
    const peerConnectionsRef = useRef(new Map()); // Map of userId -> RTCPeerConnection
    const remoteAudiosRef = useRef(new Map()); // Map of userId -> Audio element
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    };

    const startAudio = async () => {
        try {
            console.log('🎤 Starting audio with WebRTC...');

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                }
            });

            localStreamRef.current = stream;
            setIsEnabled(true);
            setIsMuted(false);

            // Setup audio analysis for speaking detection
            setupAudioAnalysis(stream);

            // Send audio_ready signal to backend
            if (wsManager?.isConnected()) {
                wsManager.send({
                    type: 'audio_ready',
                    user_id: userId,
                    user_type: userType
                });
                setIsConnected(true);
            }

            if (onStatusChange) {
                onStatusChange({ enabled: true, muted: false, connected: true });
            }

            console.log('✅ Audio enabled with WebRTC');
        } catch (error) {
            console.error('❌ Audio error:', error);
            alert('Could not access microphone. Please check browser permissions.');
        }
    };

    const stopAudio = () => {
        console.log('🛑 Stopping audio and all peer connections');

        // Close all peer connections
        peerConnectionsRef.current.forEach((pc, peerId) => {
            pc.close();
            console.log('Closed connection to', peerId);
        });
        peerConnectionsRef.current.clear();

        // Stop all remote audio
        remoteAudiosRef.current.forEach((audio) => {
            audio.pause();
            audio.srcObject = null;
        });
        remoteAudiosRef.current.clear();

        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setIsEnabled(false);
        setIsMuted(true);
        setIsConnected(false);

        // Notify backend
        if (wsManager?.isConnected()) {
            wsManager.send({
                type: 'audio_stopped',
                user_id: userId
            });
        }

        if (onStatusChange) {
            onStatusChange({ enabled: false, muted: true, connected: false });
        }
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = isMuted; // Toggle track enabled state
            });
            setIsMuted(!isMuted);
            console.log(`🎤 ${isMuted ? 'Unmuted' : 'Muted'}`);

            if (onStatusChange) {
                onStatusChange({ enabled: isEnabled, muted: !isMuted, connected: isConnected });
            }
        }
    };

    const setupAudioAnalysis = (stream) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 512;
            microphone.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            // Start monitoring audio level
            detectSpeaking();
        } catch (error) {
            console.error('Audio analysis setup error:', error);
        }
    };

    const detectSpeaking = () => {
        if (!analyserRef.current || !isEnabled) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkAudio = () => {
            if (!isEnabled || isMuted) {
                setTimeout(checkAudio, 100);
                return;
            }

            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            
            // Threshold for detecting speech
            const isSpeaking = average > 15;

            if (isSpeaking && wsManager?.isConnected()) {
                wsManager.send({
                    type: 'audio_speaking',
                    user_id: userId,
                    level: average
                });
            }

            setTimeout(checkAudio, 100);
        };

        checkAudio();
    };

    // Handle WebRTC signaling messages
    const handleWebRTCMessage = async (message) => {
        const { type, from_user, offer, answer, candidate } = message;

        console.log('📡 WebRTC message:', type, 'from:', from_user);

        switch (type) {
            case 'audio_offer':
                await handleOffer(from_user, offer);
                break;

            case 'audio_answer':
                await handleAnswer(from_user, answer);
                break;

            case 'audio_ice_candidate':
                await handleIceCandidate(from_user, candidate);
                break;

            case 'audio_user_joined':
                // New user joined, create offer if we're already streaming
                if (isEnabled && localStreamRef.current) {
                    await createOffer(from_user);
                }
                break;

            case 'audio_user_left':
                handleUserLeft(from_user);
                break;

            case 'audio_speaking':
                // Update speaking indicators
                setSpeakingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.add(from_user);
                    setTimeout(() => {
                        setSpeakingUsers(s => {
                            const updated = new Set(s);
                            updated.delete(from_user);
                            return updated;
                        });
                    }, 500);
                    return newSet;
                });
                break;
        }
    };

    const createPeerConnection = (peerId) => {
        if (peerConnectionsRef.current.has(peerId)) {
            return peerConnectionsRef.current.get(peerId);
        }

        console.log('🔗 Creating peer connection for:', peerId);

        const pc = new RTCPeerConnection(rtcConfig);

        // Add local audio track
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        // Handle remote audio track
        pc.ontrack = (event) => {
            console.log('🔊 Received remote audio from:', peerId);
            const remoteStream = event.streams[0];
            
            // Create or get audio element
            let audio = remoteAudiosRef.current.get(peerId);
            if (!audio) {
                audio = new Audio();
                audio.autoplay = true;
                remoteAudiosRef.current.set(peerId, audio);
            }
            audio.srcObject = remoteStream;
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && wsManager?.isConnected()) {
                wsManager.send({
                    type: 'audio_ice_candidate',
                    to_user: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        pc.onconnectionstatechange = () => {
            console.log(`Connection to ${peerId}:`, pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                handleUserLeft(peerId);
            }
        };

        peerConnectionsRef.current.set(peerId, pc);
        return pc;
    };

    const createOffer = async (peerId) => {
        try {
            const pc = createPeerConnection(peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (wsManager?.isConnected()) {
                wsManager.send({
                    type: 'audio_offer',
                    to_user: peerId,
                    offer: offer
                });
            }
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    };

    const handleOffer = async (peerId, offer) => {
        try {
            const pc = createPeerConnection(peerId);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (wsManager?.isConnected()) {
                wsManager.send({
                    type: 'audio_answer',
                    to_user: peerId,
                    answer: answer
                });
            }
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    };

    const handleAnswer = async (peerId, answer) => {
        try {
            const pc = peerConnectionsRef.current.get(peerId);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    };

    const handleIceCandidate = async (peerId, candidate) => {
        try {
            const pc = peerConnectionsRef.current.get(peerId);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    };

    const handleUserLeft = (peerId) => {
        console.log('👋 User left:', peerId);
        
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(peerId);
        }

        const audio = remoteAudiosRef.current.get(peerId);
        if (audio) {
            audio.pause();
            audio.srcObject = null;
            remoteAudiosRef.current.delete(peerId);
        }
    };

    // Listen for WebRTC messages from WebSocket
    useEffect(() => {
        if (!wsManager) return;

        const originalOnMessage = wsManager.onMessage;
        
        wsManager.onMessage = (message) => {
            // Check if it's an audio-related message
            if (message.type?.startsWith('audio_')) {
                handleWebRTCMessage(message);
            }
            
            // Call original handler
            if (originalOnMessage) {
                originalOnMessage(message);
            }
        };

        return () => {
            wsManager.onMessage = originalOnMessage;
        };
    }, [wsManager, isEnabled]);

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

            {isEnabled && !isConnected && (
                <span style={{ 
                    fontSize: '12px', 
                    color: '#f59e0b',
                    fontWeight: '600' 
                }}>
                    ⚠️ Connecting...
                </span>
            )}
        </div>
    );
}