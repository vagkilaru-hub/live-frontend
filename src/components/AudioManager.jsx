import { useState, useRef, useEffect } from 'react';

export default function AudioManager({ wsManager, userId, userType, onStatusChange }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [muted, setMuted] = useState(true);
  const [connected, setConnected] = useState(false);
  const [peerConnections, setPeerConnections] = useState({});
  const [error, setError] = useState(null);
  
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const remoteAudiosRef = useRef({});

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  };

  // Setup WebSocket message handlers
  useEffect(() => {
    if (!wsManager) return;

    const originalSend = wsManager.send.bind(wsManager);
    
    // Store original onMessage
    const originalOnMessage = wsManager.onMessage;
    
    // Override onMessage to handle WebRTC signaling
    wsManager.onMessage = (message) => {
      // Call original handler first
      if (originalOnMessage) {
        originalOnMessage(message);
      }

      // Handle WebRTC messages
      handleWebSocketMessage(message);
    };

    setConnected(wsManager.isConnected());

    return () => {
      // Restore original onMessage
      if (originalOnMessage) {
        wsManager.onMessage = originalOnMessage;
      }
    };
  }, [wsManager]);

  // Handle WebSocket messages
  const handleWebSocketMessage = async (message) => {
    try {
      switch (message.type) {
        case 'teacher_audio_ready':
        case 'student_audio_ready':
          await handlePeerAudioReady(message.data);
          break;
        
        case 'webrtc_offer':
          await handleOffer(message.data);
          break;
        
        case 'webrtc_answer':
          await handleAnswer(message.data);
          break;
        
        case 'webrtc_ice_candidate':
          await handleIceCandidate(message.data);
          break;
        
        case 'teacher_audio_stopped':
        case 'student_audio_stopped':
          handlePeerAudioStopped(message.data);
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  };

  // Handle when a peer's audio becomes ready
  const handlePeerAudioReady = async (data) => {
    const peerId = data.teacher_id || data.student_id;
    if (peerId === userId) return; // Ignore self

    console.log('🎤 Peer audio ready:', peerId);

    // If we have audio enabled, create offer
    if (localStreamRef.current) {
      await createOffer(peerId);
    }
  };

  // Create peer connection
  const createPeerConnection = async (peerId) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId];
    }

    console.log('🔗 Creating peer connection for:', peerId);
    const peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current[peerId] = peerConnection;
    pendingCandidatesRef.current[peerId] = [];

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
        console.log('📤 Added local track to peer connection');
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && wsManager?.isConnected()) {
        console.log('🧊 Sending ICE candidate to:', peerId);
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

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
      console.log('📻 Received remote audio track from:', peerId);
      
      // Create or get audio element
      let audioElement = remoteAudiosRef.current[peerId];
      if (!audioElement) {
        audioElement = new Audio();
        audioElement.autoplay = true;
        remoteAudiosRef.current[peerId] = audioElement;
        console.log('🔊 Created audio element for:', peerId);
      }
      
      audioElement.srcObject = event.streams[0];
      audioElement.play().catch(err => {
        console.error('Error playing audio:', err);
        // Try to play again after user interaction
        document.addEventListener('click', () => {
          audioElement.play().catch(console.error);
        }, { once: true });
      });
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state for ${peerId}:`, peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        console.log('✅ WebRTC connected with:', peerId);
        setPeerConnections(prev => ({ ...prev, [peerId]: 'connected' }));
        updateStatus();
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        console.log('❌ WebRTC disconnected from:', peerId);
        setPeerConnections(prev => {
          const newState = { ...prev };
          delete newState[peerId];
          return newState;
        });
        updateStatus();
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE state for ${peerId}:`, peerConnection.iceConnectionState);
    };

    return peerConnection;
  };

  // Create and send offer
  const createOffer = async (peerId) => {
    try {
      const peerConnection = await createPeerConnection(peerId);
      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      await peerConnection.setLocalDescription(offer);
      
      if (wsManager?.isConnected()) {
        console.log('📤 Sending offer to:', peerId);
        wsManager.send({
          type: 'webrtc_offer',
          data: {
            offer: offer,
            to_peer_id: peerId,
            from_peer_id: userId,
          }
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  };

  // Handle incoming offer
  const handleOffer = async (data) => {
    try {
      const { offer, from_peer_id } = data;
      console.log('📥 Received offer from:', from_peer_id);
      
      const peerConnection = await createPeerConnection(from_peer_id);
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('✅ Set remote description');

      // Process pending ICE candidates
      if (pendingCandidatesRef.current[from_peer_id]) {
        console.log('🧊 Processing pending ICE candidates');
        for (const candidate of pendingCandidatesRef.current[from_peer_id]) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current[from_peer_id] = [];
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      if (wsManager?.isConnected()) {
        console.log('📤 Sending answer to:', from_peer_id);
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

  // Handle incoming answer
  const handleAnswer = async (data) => {
    try {
      const { answer, from_peer_id } = data;
      console.log('📥 Received answer from:', from_peer_id);
      
      const peerConnection = peerConnectionsRef.current[from_peer_id];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Set remote description from answer');
      }
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (data) => {
    try {
      const { candidate, from_peer_id } = data;
      console.log('🧊 Received ICE candidate from:', from_peer_id);
      
      const peerConnection = peerConnectionsRef.current[from_peer_id];
      
      if (peerConnection && peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Added ICE candidate');
      } else {
        // Store for later
        if (!pendingCandidatesRef.current[from_peer_id]) {
          pendingCandidatesRef.current[from_peer_id] = [];
        }
        pendingCandidatesRef.current[from_peer_id].push(candidate);
        console.log('📦 Stored ICE candidate for later');
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  // Handle peer audio stopped
  const handlePeerAudioStopped = (data) => {
    const peerId = data.teacher_id || data.student_id;
    console.log('🛑 Peer audio stopped:', peerId);
    
    // Close peer connection
    if (peerConnectionsRef.current[peerId]) {
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
    }
    
    // Remove audio element
    if (remoteAudiosRef.current[peerId]) {
      remoteAudiosRef.current[peerId].pause();
      remoteAudiosRef.current[peerId].srcObject = null;
      delete remoteAudiosRef.current[peerId];
    }
    
    setPeerConnections(prev => {
      const newState = { ...prev };
      delete newState[peerId];
      return newState;
    });
    
    updateStatus();
  };

  // Update connection status
  const updateStatus = () => {
    const hasConnections = Object.keys(peerConnectionsRef.current).length > 0;
    const allConnected = Object.values(peerConnectionsRef.current).every(
      pc => pc.connectionState === 'connected'
    );
    
    if (onStatusChange) {
      onStatusChange({
        enabled: audioEnabled,
        muted: muted,
        connected: hasConnections && allConnected,
      });
    }
  };

  // Start audio
  const startAudio = async () => {
    try {
      console.log('🎤 Starting audio...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } 
      });
      
      localStreamRef.current = stream;
      setAudioEnabled(true);
      setError(null);
      
      console.log('✅ Audio stream started');
      
      // Notify server
      if (wsManager?.isConnected()) {
        wsManager.send({
          type: 'audio_ready',
          data: {
            userId: userId,
            userType: userType,
          }
        });
      }

      updateStatus();

    } catch (err) {
      console.error('❌ Error starting audio:', err);
      setError('Microphone access denied');
      setAudioEnabled(false);
    }
  };

  // Stop audio
  const stopAudio = () => {
    console.log('🛑 Stopping audio...');
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
    });
    
    // Stop all remote audios
    Object.keys(remoteAudiosRef.current).forEach(peerId => {
      remoteAudiosRef.current[peerId].pause();
      remoteAudiosRef.current[peerId].srcObject = null;
      delete remoteAudiosRef.current[peerId];
    });

    setAudioEnabled(false);
    setMuted(true);
    setPeerConnections({});

    // Notify server
    if (wsManager?.isConnected()) {
      wsManager.send({
        type: 'audio_stopped',
        data: {
          userId: userId,
          userType: userType,
        }
      });
    }

    updateStatus();
  };

  // Toggle audio
  const toggleAudio = () => {
    if (audioEnabled) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (!localStreamRef.current) return;

    const newMuted = !muted;
    
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMuted;
    });
    
    setMuted(newMuted);
    console.log(`${newMuted ? '🔇 Muted' : '🔊 Unmuted'}`);

    updateStatus();
  };

  const connectedCount = Object.keys(peerConnections).length;
  const isFullyConnected = audioEnabled && connectedCount > 0;

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
      )}

      {audioEnabled && (
        <div style={{
          padding: '6px 12px',
          backgroundColor: isFullyConnected ? '#dcfce7' : '#fef3c7',
          color: isFullyConnected ? '#166534' : '#92400e',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
        }}>
          {isFullyConnected ? `✓ Connected (${connectedCount})` : '⏳ Connecting...'}
        </div>
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