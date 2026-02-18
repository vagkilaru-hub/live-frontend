import { useState, useRef, useEffect } from 'react';

export default function AudioManager({ wsManager, userId, userType, onStatusChange }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [muted, setMuted] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [rtcConnected, setRtcConnected] = useState(false);
  
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  useEffect(() => {
    if (wsManager) {
      setConnected(wsManager.isConnected());
      setupWebSocketListeners();
    }
  }, [wsManager]);

  useEffect(() => {
    return () => {
      stopAudio();
      closeAllPeerConnections();
    };
  }, []);

  const setupWebSocketListeners = () => {
    // Listen for WebRTC signaling messages
    const originalOnMessage = wsManager.onMessage;
    
    wsManager.onMessage = (message) => {
      // Call original handler
      if (originalOnMessage) {
        originalOnMessage(message);
      }

      // Handle WebRTC signaling
      switch (message.type) {
        case 'webrtc_offer':
          handleOffer(message.data);
          break;
        case 'webrtc_answer':
          handleAnswer(message.data);
          break;
        case 'webrtc_ice_candidate':
          handleIceCandidate(message.data);
          break;
        case 'peer_left':
          removePeerConnection(message.data.peer_id);
          break;
      }
    };
  };

  const createPeerConnection = async (peerId) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    const peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current[peerId] = peerConnection;
    pendingCandidatesRef.current[peerId] = [];

    // Add local audio stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && wsManager.isConnected()) {
        wsManager.send({
          type: 'webrtc_ice_candidate',
          data: {
            candidate: event.candidate,
            to_peer_id: peerId,
            from_peer_id: userId,
          }
        });
      }
    };

    // Handle incoming audio stream
    peerConnection.ontrack = (event) => {
      console.log('📻 Received audio stream from:', peerId);
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play().catch(err => console.error('Error playing audio:', err));
      setRtcConnected(true);
    };

    // Handle connection state
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        setRtcConnected(true);
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        setRtcConnected(false);
      }
    };

    return peerConnection;
  };

  const handleOffer = async (data) => {
    try {
      const { offer, from_peer_id } = data;
      const peerConnection = await createPeerConnection(from_peer_id);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Process pending ICE candidates
      if (pendingCandidatesRef.current[from_peer_id]) {
        pendingCandidatesRef.current[from_peer_id].forEach(candidate => {
          peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });
        pendingCandidatesRef.current[from_peer_id] = [];
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (wsManager.isConnected()) {
        wsManager.send({
          type: 'webrtc_answer',
          data: {
            answer: answer,
            to_peer_id: from_peer_id,
            from_peer_id: userId,
          }
        });
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleAnswer = async (data) => {
    try {
      const { answer, from_peer_id } = data;
      const peerConnection = peerConnectionsRef.current[from_peer_id];
      
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      const { candidate, from_peer_id } = data;
      const peerConnection = peerConnectionsRef.current[from_peer_id];

      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Store candidate for later
        if (!pendingCandidatesRef.current[from_peer_id]) {
          pendingCandidatesRef.current[from_peer_id] = [];
        }
        pendingCandidatesRef.current[from_peer_id].push(candidate);
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  const removePeerConnection = (peerId) => {
    if (peerConnectionsRef.current[peerId]) {
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
      delete pendingCandidatesRef.current[peerId];
    }
  };

  const closeAllPeerConnections = () => {
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      removePeerConnection(peerId);
    });
  };

  const startAudio = async () => {
    try {
      console.log('🎤 Starting audio...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      localStreamRef.current = stream;
      setAudioEnabled(true);
      setError(null);
      
      console.log('✅ Audio stream started');
      
      // Notify server that audio is ready
      if (wsManager && wsManager.isConnected()) {
        wsManager.send({
          type: 'audio_ready',
          data: {
            userId: userId,
            userType: userType,
          }
        });
      }

      const status = {
        enabled: true,
        muted: muted,
        connected: true,
      };
      
      if (onStatusChange) {
        onStatusChange(status);
      }

    } catch (err) {
      console.error('❌ Error starting audio:', err);
      setError('Microphone access denied');
      setAudioEnabled(false);
    }
  };

  const stopAudio = () => {
    console.log('🛑 Stopping audio...');
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    closeAllPeerConnections();
    setAudioEnabled(false);
    setMuted(true);
    setRtcConnected(false);

    if (wsManager && wsManager.isConnected()) {
      wsManager.send({
        type: 'audio_stopped',
        data: {
          userId: userId,
          userType: userType,
        }
      });
    }

    const status = {
      enabled: false,
      muted: true,
      connected: false,
    };
    
    if (onStatusChange) {
      onStatusChange(status);
    }
  };

  const toggleAudio = () => {
    if (audioEnabled) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;

    const newMuted = !muted;
    
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMuted;
    });
    
    setMuted(newMuted);
    console.log(`${newMuted ? '🔇 Muted' : '🔊 Unmuted'}`);

    const status = {
      enabled: audioEnabled,
      muted: newMuted,
      connected: connected && audioEnabled,
    };
    
    if (onStatusChange) {
      onStatusChange(status);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        onClick={toggleAudio}
        style={{
          padding: '8px 16px',
          backgroundColor: audioEnabled ? '#22c55e' : '#6b7280',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          transition: 'all 0.2s',
          boxShadow: audioEnabled ? '0 2px 8px rgba(34, 197, 94, 0.3)' : 'none',
        }}
        title={audioEnabled ? 'Turn off audio' : 'Turn on audio'}
      >
        {audioEnabled ? '🎤 Audio On' : '🎤 Audio Off'}
      </button>
      
      {audioEnabled && (
        <>
          <button
            onClick={toggleMute}
            style={{
              padding: '8px 16px',
              backgroundColor: muted ? '#ef4444' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s',
            }}
          >
            {muted ? '🔇 Muted' : '🔊 Unmuted'}
          </button>

          {rtcConnected && (
            <div style={{
              padding: '6px 12px',
              backgroundColor: '#dcfce7',
              color: '#166534',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
            }}>
              ✓ Connected
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{
          padding: '6px 12px',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}