import { useState, useRef, useEffect } from 'react';

export default function AudioManager({ wsManager, userId, userType, onStatusChange }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [muted, setMuted] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const peerConnectionsRef = useRef({});

  useEffect(() => {
    if (wsManager) {
      setConnected(wsManager.isConnected());
    }
  }, [wsManager]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopAudio();
    };
  }, []);

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
      
      // Send audio status to server
      if (wsManager && wsManager.isConnected()) {
        wsManager.send({
          type: 'audio_status',
          data: {
            enabled: true,
            muted: muted,
            userId: userId,
            userType: userType,
          }
        });
      }

      const status = {
        enabled: true,
        muted: muted,
        connected: connected,
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
        console.log('Track stopped:', track.kind);
      });
      localStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAudioEnabled(false);
    setMuted(true);

    // Send audio status to server
    if (wsManager && wsManager.isConnected()) {
      wsManager.send({
        type: 'audio_status',
        data: {
          enabled: false,
          muted: true,
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

    // Send mute status to server
    if (wsManager && wsManager.isConnected()) {
      wsManager.send({
        type: 'audio_status',
        data: {
          enabled: audioEnabled,
          muted: newMuted,
          userId: userId,
          userType: userType,
        }
      });
    }

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
            boxShadow: muted ? '0 2px 8px rgba(239, 68, 68, 0.3)' : '0 2px 8px rgba(34, 197, 94, 0.3)',
          }}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇 Muted' : '🔊 Unmuted'}
        </button>
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