import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebSocketManager } from '../utils/websocket';
import TeacherCamera from '../components/TeacherCamera';
import AudioManager from '../components/AudioManager';
import { getStatusColor, getStatusLabel, formatTimeIST } from '../utils/detection';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function TeacherPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [audioStatus, setAudioStatus] = useState({ enabled: false, muted: true, connected: false });
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('📨 Teacher received:', message.type);

    switch (message.type) {
      case 'room_created':
        setRoomId(message.data.room_id);
        setStudents(message.data.students || []);
        // Auto-start camera when room is created
        setTimeout(() => {
          startTeacherCamera();
        }, 1000);
        break;

      case 'student_join':
        setStudents(message.data.students || []);
        break;

      case 'student_leave':
        setStudents(message.data.students || []);
        setAlerts(prev => prev.filter(alert => alert.student_id !== message.data.student_id));
        break;

      case 'attention_update':
        setStudents(prev => prev.map(student =>
          student.id === message.data.student_id
            ? { ...student, status: message.data.status, last_update: message.data.timestamp }
            : student
        ));
        break;

      case 'alert':
        const newAlert = {
          id: `${message.data.student_id}_${Date.now()}`,
          ...message.data
        };
        setAlerts(prev => {
          const filtered = prev.filter(a => a.student_id !== message.data.student_id);
          return [newAlert, ...filtered].slice(0, 50);
        });
        break;

      case 'clear_alert':
        setAlerts(prev => prev.filter(alert => alert.student_id !== message.data.student_id));
        break;

      case 'chat_message':
        setMessages(prev => [...prev, message.data]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        break;

      case 'camera_frame':
        // Student camera frames handled separately
        break;

      default:
        break;
    }
  }, []);

  // Start teacher camera automatically
  const startTeacherCamera = async () => {
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
        setShowCamera(true);
        console.log('✅ Teacher camera started');

        // Start sending frames to students
        frameIntervalRef.current = setInterval(() => {
          captureAndSendFrame();
        }, 100); // Send 10 frames per second
      }
    } catch (error) {
      console.error('❌ Camera error:', error);
      alert('Could not access camera: ' + error.message);
    }
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !wsRef.current?.isConnected()) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const frameData = canvas.toDataURL('image/jpeg', 0.7);
        wsRef.current.send({
          type: 'teacher_camera_frame',
          frame: frameData
        });
      } catch (err) {
        console.error('Frame capture error:', err);
      }
    }
  };

  const stopTeacherCamera = () => {
    console.log('🛑 Stopping teacher camera...');
    
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setShowCamera(false);
  };

  useEffect(() => {
    console.log('🔌 Connecting teacher WebSocket...');
    const wsUrl = `${WS_URL}/ws/teacher?name=Teacher`;
    wsRef.current = new WebSocketManager(wsUrl, handleWebSocketMessage);

    wsRef.current.connect()
      .then(() => {
        console.log('✅ Teacher connected');
        setIsConnected(true);
      })
      .catch((err) => {
        console.error('❌ Connection failed:', err);
        alert('Failed to connect to server');
      });

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [handleWebSocketMessage]);

  const handleLeaveClass = () => {
    if (window.confirm('End class and disconnect all students?')) {
      stopTeacherCamera();
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      navigate('/');
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

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    alert('Room code copied!');
  };

  const clearAllAlerts = () => {
    setAlerts([]);
  };

  const attentiveCount = students.filter(s => s.status === 'attentive').length;
  const needsAttentionCount = students.filter(s => s.status !== 'attentive').length;
  const activeAlertsCount = alerts.length;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '16px 24px',
        marginBottom: '20px',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
            Live Feedback System
          </h1>
          <button
            onClick={() => navigate('/')}
            style={{
              marginTop: '4px',
              padding: '0',
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Back to Home
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            padding: '8px 16px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '500',
          }}>
            ● {isConnected ? 'Connected' : 'Connecting...'}
          </div>

          {showCamera && (
            <button
              onClick={stopTeacherCamera}
              style={{
                padding: '8px 16px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              📹 Camera On
            </button>
          )}

          <AudioManager
            wsManager={wsRef.current}
            userId="teacher"
            userType="teacher"
            onStatusChange={(status) => {
              setAudioStatus(status);
              console.log('Teacher audio:', status);
            }}
          />

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            💬 Chat {messages.length > 0 && `(${messages.length})`}
          </button>

          <button
            onClick={handleLeaveClass}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            Leave Class
          </button>
        </div>
      </div>

      {/* Room Code */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px 24px',
        marginBottom: '20px',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      }}>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          🔗 ROOM CODE - SHARE WITH STUDENTS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 'bold',
            letterSpacing: '8px',
            fontFamily: 'monospace',
            color: '#111827',
          }}>
            {roomId || 'LOADING...'}
          </div>
          {roomId && (
            <button
              onClick={copyRoomCode}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              📋 Copy Code
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '20px',
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          border: '2px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600', marginBottom: '8px' }}>
            Total Students
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827' }}>
            {students.length}
          </div>
        </div>

        <div style={{
          backgroundColor: '#dcfce7',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          border: '2px solid #86efac',
        }}>
          <div style={{ fontSize: '13px', color: '#166534', fontWeight: '600', marginBottom: '8px' }}>
            Attentive
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#166534' }}>
            {attentiveCount}
          </div>
        </div>

        <div style={{
          backgroundColor: '#fee2e2',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          border: '2px solid #fca5a5',
        }}>
          <div style={{ fontSize: '13px', color: '#991b1b', fontWeight: '600', marginBottom: '8px' }}>
            Needs Attention
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#991b1b' }}>
            {needsAttentionCount}
          </div>
        </div>

        <div style={{
          backgroundColor: '#fef3c7',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          border: '2px solid #fde68a',
        }}>
          <div style={{ fontSize: '13px', color: '#92400e', fontWeight: '600', marginBottom: '8px' }}>
            Active Alerts
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#92400e' }}>
            {activeAlertsCount}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isChatOpen ? '1fr 350px' : '1fr',
        gap: '20px',
      }}>
        {/* Left Column - Students & Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Students List */}
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              👥 Students ({students.length})
            </h3>
            {students.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>👥</div>
                <div>No students connected yet</div>
                <div style={{ marginTop: '8px', fontSize: '13px' }}>
                  Share room code: <strong>{roomId}</strong>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {students.map((student) => (
                  <div
                    key={student.id}
                    style={{
                      padding: '16px',
                      backgroundColor: getStatusColor(student.status) + '15',
                      border: `2px solid ${getStatusColor(student.status)}`,
                      borderRadius: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px', color: '#111827' }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                        Updated: {student.last_update ? formatTimeIST(student.last_update) : 'N/A'}
                      </div>
                    </div>
                    <div style={{
                      padding: '8px 16px',
                      backgroundColor: getStatusColor(student.status),
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: '600',
                    }}>
                      {getStatusLabel(student.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-Time Alerts */}
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                🚨 Real-Time Alerts
                {activeAlertsCount > 0 && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '4px 12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}>
                    {activeAlertsCount} Active
                  </span>
                )}
              </h3>
              {alerts.length > 0 && (
                <button
                  onClick={clearAllAlerts}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                <div>No active alerts</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>All students are attentive</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      padding: '16px',
                      backgroundColor: '#fef3c7',
                      border: '2px solid #fbbf24',
                      borderRadius: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                      <div style={{ fontWeight: '600', fontSize: '15px', color: '#92400e' }}>
                        ⚠️ {alert.student_name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#92400e' }}>
                        {alert.timestamp ? formatTimeIST(alert.timestamp) : 'Now'}
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', color: '#78350f' }}>
                      {alert.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Chat */}
        {isChatOpen && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            height: '600px',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: '#111827' }}>
              💬 Chat
            </h3>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              marginBottom: '16px',
            }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', paddingTop: '40px', fontSize: '14px' }}>
                  No messages yet
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: '12px',
                      padding: '12px',
                      backgroundColor: msg.user_type === 'teacher' ? '#eff6ff' : 'white',
                      borderRadius: '8px',
                      border: `2px solid ${msg.user_type === 'teacher' ? '#3b82f6' : '#e5e7eb'}`,
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                      {msg.user_name}{msg.user_type === 'teacher' && ' 👨‍🏫'}
                    </div>
                    <div style={{ fontSize: '14px', color: '#374151' }}>{msg.message}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
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
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
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
                  fontSize: '14px',
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

      {/* Hidden video and canvas for teacher camera */}
      <div style={{ display: 'none' }}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}