import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StudentCamera from '../components/StudentCamera';
import { WebSocketManager } from '../utils/websocket';
import { formatTimeIST } from '../utils/detection';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function StudentPage() {
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [activeTab, setActiveTab] = useState('participants');
  const [participantFrames, setParticipantFrames] = useState({});

  const wsRef = useRef(null);
  const studentIdRef = useRef(null);
  const chatEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('📨 Student received:', message.type);

    switch (message.type) {
      case 'participant_list':
        setParticipants(message.data.participants || []);
        break;

      case 'student_join':
        setParticipants(prev => {
          const exists = prev.some(p => p.id === message.data.student_id);
          if (exists) return prev;
          return [...prev, {
            id: message.data.student_id,
            name: message.data.student_name,
            type: 'student'
          }];
        });
        break;

      case 'student_leave':
        setParticipants(prev => prev.filter(p => p.id !== message.data.student_id));
        break;

      case 'camera_frame':
        if (message.data.student_id !== studentIdRef.current) {
          setParticipantFrames(prev => ({
            ...prev,
            [message.data.student_id]: message.data.frame
          }));
        }
        break;

      case 'chat_message':
        setMessages(prev => [...prev, message.data]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        break;

      case 'room_closed':
        alert('Teacher ended the class');
        setIsJoined(false);
        navigate('/');
        break;

      case 'error':
        setConnectionError(message.message);
        setIsConnected(false);
        break;

      default:
        break;
    }
  }, [navigate]);

  const connectWebSocket = useCallback(() => {
    if (!roomCode || !studentIdRef.current || !studentName) return;

    console.log('🔌 Connecting student WebSocket...');
    const wsUrl = `${WS_URL}/ws/student/${roomCode}/${studentIdRef.current}?name=${encodeURIComponent(studentName)}`;
    wsRef.current = new WebSocketManager(wsUrl, handleWebSocketMessage);

    wsRef.current.connect()
      .then(() => {
        console.log('✅ Student connected');
        setIsConnected(true);
        setConnectionError('');
      })
      .catch((err) => {
        console.error('❌ Connection failed:', err);
        setIsConnected(false);
        setConnectionError('Failed to connect. Retrying...');
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      });
  }, [roomCode, studentName, handleWebSocketMessage]);

  const handleJoin = () => {
    if (!studentName.trim() || !roomCode.trim()) {
      alert('Please enter your name and room code');
      return;
    }

    studentIdRef.current = `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setIsJoined(true);
    connectWebSocket();
  };

  const handleLeave = () => {
    if (window.confirm('Leave the class?')) {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      setIsJoined(false);
      navigate('/');
    }
  };

  const handleStatusChange = (detectionData) => {
    console.log('═══════════════════════════════════════');
    console.log('📊 DETECTION:', detectionData.status);
    console.log('🔌 WebSocket Connected:', wsRef.current?.isConnected());
    console.log('═══════════════════════════════════════');

    if (wsRef.current?.isConnected()) {
      const message = {
        type: 'attention_update',
        data: detectionData,
      };

      wsRef.current.send(message);
      console.log('✅ SENT TO SERVER:', message);
    } else {
      console.error('❌ WEBSOCKET NOT CONNECTED');
    }
  };

  const handleFrameCapture = (frameData) => {
    if (wsRef.current?.isConnected()) {
      wsRef.current.send({
        type: 'camera_frame',
        frame: frameData,
      });
    }
  };

  const sendMessage = () => {
    if (messageInput.trim() && wsRef.current?.isConnected()) {
      wsRef.current.send({
        type: 'chat_message',
        message: messageInput.trim()
      });
      setMessageInput('');
    }
  };

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, []);

  if (!isJoined) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          maxWidth: '500px',
          width: '100%',
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 'bold',
            marginBottom: '8px',
            textAlign: 'center',
            color: '#1e293b',
          }}>
            Join Class
          </h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px', fontSize: '15px' }}>
            Enter your details to join the live session
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
              Your Name
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit code"
              maxLength={6}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '20px',
                fontWeight: 'bold',
                textAlign: 'center',
                letterSpacing: '4px',
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={!studentName.trim() || !roomCode.trim()}
            style={{
              width: '100%',
              padding: '14px',
              background: studentName.trim() && roomCode.trim()
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: studentName.trim() && roomCode.trim() ? 'pointer' : 'not-allowed',
              marginBottom: '16px',
            }}
          >
            Join Class
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  const otherParticipants = participants.filter(p => p.id !== studentIdRef.current);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '16px 24px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 }}>
            Hello, {studentName}
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
            Room: <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px' }}>{roomCode}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            padding: '6px 14px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '16px',
            fontSize: '13px',
            fontWeight: '500',
            color: isConnected ? '#166534' : '#991b1b',
          }}>
            ● {isConnected ? 'Connected' : 'Reconnecting...'}
          </div>

          <button
            onClick={handleLeave}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Tabs - Only 2 tabs now */}
      <div style={{
        backgroundColor: 'white',
        padding: '8px',
        marginBottom: '20px',
        borderRadius: '12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}>
        <button
          onClick={() => setActiveTab('participants')}
          style={{
            padding: '12px',
            background: activeTab === 'participants'
              ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
              : '#f3f4f6',
            color: activeTab === 'participants' ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          👥 Participants ({otherParticipants.length + 1})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          style={{
            padding: '12px',
            background: activeTab === 'chat'
              ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
              : '#f3f4f6',
            color: activeTab === 'chat' ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          💬 Chat {messages.length > 0 && `(${messages.length})`}
        </button>
      </div>

      {/* Main Content */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        minHeight: '500px',
      }}>
        {/* PARTICIPANTS TAB */}
        {activeTab === 'participants' && (
          <>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              Participants ({otherParticipants.length + 1})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                padding: '16px',
                backgroundColor: '#dcfce7',
                border: '2px solid #22c55e',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 'bold',
                }}>
                  {studentName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#111827' }}>
                    {studentName} (You) 🎓
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534', marginTop: '2px' }}>
                    Student
                  </div>
                </div>
              </div>

              {otherParticipants.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: '#9ca3af',
                  padding: '40px 20px',
                  fontSize: '13px',
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                  <div>No other participants yet</div>
                </div>
              ) : (
                otherParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    style={{
                      padding: '16px',
                      backgroundColor: participant.type === 'teacher' ? '#eff6ff' : '#fafafa',
                      border: participant.type === 'teacher' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: participant.type === 'teacher'
                        ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '20px',
                      fontWeight: 'bold',
                    }}>
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '15px', color: '#111827' }}>
                        {participant.name} {participant.type === 'teacher' ? '👨‍🏫' : '🎓'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {participant.type === 'teacher' ? 'Teacher' : 'Student'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              Chat
            </h3>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '10px',
              marginBottom: '16px',
            }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '40px', fontSize: '13px' }}>
                  No messages yet
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: '10px',
                      padding: '12px',
                      backgroundColor: msg.user_type === 'teacher' ? '#eff6ff' : 'white',
                      borderRadius: '8px',
                      border: `1px solid ${msg.user_type === 'teacher' ? '#3b82f6' : '#e5e7eb'}`,
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                      {msg.user_name}{msg.user_type === 'teacher' && ' 👨‍🏫'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>{msg.message}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                      {formatTimeIST(msg.timestamp)}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                style={{
                  padding: '12px 20px',
                  background: messageInput.trim()
                    ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                    : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: messageInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student's Own Camera - Bottom Right Corner */}
      <div style={{
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        width: '300px',
        zIndex: 9999,
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        borderRadius: '12px',
        border: '3px solid #22c55e',
        overflow: 'hidden',
        backgroundColor: 'white',
      }}>
        <div style={{
          backgroundColor: '#22c55e',
          color: 'white',
          padding: '10px 16px',
          fontSize: '13px',
          fontWeight: '700',
          textAlign: 'center',
        }}>
          📹 Your Camera
        </div>
        
        <div style={{ width: '100%', height: '225px', position: 'relative', backgroundColor: '#000' }}>
          <StudentCamera
            onStatusChange={handleStatusChange}
            onFrameCapture={handleFrameCapture}
          />
        </div>
      </div>

      {connectionError && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
          zIndex: 10000,
        }}>
          {connectionError}
        </div>
      )}
    </div>
  );
}