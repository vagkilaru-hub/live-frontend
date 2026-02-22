import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AudioManager from '../components/AudioManager';
import { WebSocketManager } from '../utils/websocket';
import { formatTimeIST } from '../utils/detection';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function TeacherPage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [students, setStudents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [studentFrames, setStudentFrames] = useState({});

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('📨 Teacher received:', message.type);

    switch (message.type) {
      case 'room_created':
        console.log('🏠 Room created:', message.data.room_id);
        setRoomId(message.data.room_id);
        setStudents(message.data.students || []);
        break;

      case 'student_join':
        console.log('👋 Student joined:', message.data.student_name);
        setStudents(prev => {
          const exists = prev.some(s => s.id === message.data.student_id);
          if (exists) return prev;
          return [...prev, {
            id: message.data.student_id,
            name: message.data.student_name,
            status: 'attentive',
            last_update: message.data.timestamp
          }];
        });
        break;

      case 'student_leave':
        console.log('👋 Student left:', message.data.student_name);
        setStudents(prev => prev.filter(s => s.id !== message.data.student_id));
        setAlerts(prev => prev.filter(a => a.student_id !== message.data.student_id));
        break;

      case 'attention_update':
        console.log('📊 Attention update:', message.data.student_name, '→', message.data.status);
        setStudents(prev => prev.map(student =>
          student.id === message.data.student_id
            ? { ...student, status: message.data.status, last_update: message.data.timestamp }
            : student
        ));
        break;

      case 'alert':
        console.log('🚨 Alert:', message.data);
        const newAlert = {
          id: `${message.data.student_id}-${Date.now()}`,
          ...message.data
        };
        setAlerts(prev => {
          const exists = prev.some(a => a.student_id === message.data.student_id);
          if (exists) return prev;
          return [...prev, newAlert];
        });
        break;

      case 'clear_alert':
        console.log('✅ Clear alert:', message.data.student_id);
        setAlerts(prev => prev.filter(a => a.student_id !== message.data.student_id));
        break;

      case 'camera_frame':
        setStudentFrames(prev => ({
          ...prev,
          [message.data.student_id]: message.data.frame
        }));
        break;

      case 'chat_message':
        setMessages(prev => [...prev, message.data]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        break;

      case 'heartbeat':
        // Ignore
        break;

      default:
        if (message.type !== 'heartbeat' && message.type !== 'heartbeat_ack') {
          console.log('Unknown message:', message.type);
        }
        break;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    console.log('🔌 Connecting teacher WebSocket...');
    const wsUrl = `${WS_URL}/ws/teacher`;
    wsRef.current = new WebSocketManager(wsUrl, handleWebSocketMessage);

    wsRef.current.connect()
      .then(() => {
        console.log('✅ Teacher connected');
        setIsConnected(true);
      })
      .catch((err) => {
        console.error('❌ Connection failed:', err);
        setIsConnected(false);
      });
  }, [handleWebSocketMessage]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [connectWebSocket]);

  // ✅ AUTO TEACHER CAMERA STREAMING
  useEffect(() => {
    if (!isConnected || !wsRef.current || !roomId) return;

    let stream = null;
    let interval = null;
    const canvas = document.createElement('canvas');
    const video = document.createElement('video');

    const startAutoStream = async () => {
      try {
        console.log('🎥 AUTO-STARTING TEACHER CAMERA...');
        
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 360 } 
        });
        
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        
        console.log('✅ TEACHER CAMERA AUTO-STARTED');
        
        setTimeout(() => {
          interval = setInterval(() => {
            if (!wsRef.current?.isConnected()) return;
            
            canvas.width = 480;
            canvas.height = 270;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 480, 270);
            
            const frame = canvas.toDataURL('image/jpeg', 0.4);
            
            if (frame.length > 3000) {
              wsRef.current.send({
                type: 'teacher_camera_frame',
                frame: frame
              });
            }
          }, 1000);
          
          console.log('✅ TEACHER CAMERA STREAMING TO STUDENTS');
        }, 2000);
        
      } catch (err) {
        console.error('❌ Auto camera failed:', err);
      }
    };

    startAutoStream();

    return () => {
      console.log('🛑 Stopping teacher camera');
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (wsRef.current?.isConnected()) {
        wsRef.current.send({ type: 'teacher_camera_stopped' });
      }
    };
  }, [isConnected, roomId]);

  const sendMessage = () => {
    if (messageInput.trim() && wsRef.current?.isConnected()) {
      wsRef.current.send({
        type: 'chat_message',
        message: messageInput.trim()
      });
      setMessageInput('');
    }
  };

  const handleLeaveClass = () => {
    if (window.confirm('End class and close room?')) {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      navigate('/');
    }
  };

  const clearAllAlerts = () => {
    setAlerts([]);
  };

  const stats = {
    total: students.length,
    attentive: students.filter(s => s.status === 'attentive').length,
    needsAttention: students.filter(s => s.status !== 'attentive').length,
    activeAlerts: alerts.length
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px 30px',
        borderRadius: '16px',
        marginBottom: '20px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
            Live Feedback System
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '8px 0 0 0' }}>
            Teacher Dashboard
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Connection Status */}
          <div style={{
            padding: '10px 20px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '25px',
            fontSize: '14px',
            fontWeight: '600',
            color: isConnected ? '#166534' : '#991b1b'
          }}>
            ● {isConnected ? 'Connected' : 'Disconnected'}
          </div>

          {/* Room Code */}
          {roomId && (
            <div style={{
              padding: '10px 20px',
              backgroundColor: '#eff6ff',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '14px', color: '#1e40af', fontWeight: '600' }}>
                Room Code:
              </span>
              <span style={{
                fontSize: '24px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                color: '#1e40af',
                letterSpacing: '4px'
              }}>
                {roomId}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  alert('Room code copied!');
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
              >
                Copy
              </button>
            </div>
          )}

          {/* Audio Manager */}
          <AudioManager
            wsManager={wsRef.current}
            userId="teacher"
            userType="teacher"
          />

          {/* Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            style={{
              padding: '10px 20px',
              backgroundColor: showChat ? '#3b82f6' : '#f3f4f6',
              color: showChat ? 'white' : '#374151',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            💬 Chat {messages.length > 0 && `(${messages.length})`}
          </button>

          {/* Leave Button */}
          <button
            onClick={handleLeaveClass}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Leave Class
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Students</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>{stats.total}</div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Attentive</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e' }}>{stats.attentive}</div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Needs Attention</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.needsAttention}</div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Active Alerts</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{stats.activeAlerts}</div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: showChat ? '1fr 400px' : '1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Alerts */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                🚨 Real-Time Alerts
              </h3>
              {alerts.length > 0 && (
                <button
                  onClick={clearAllAlerts}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {alerts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div>No active alerts</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>All students are attentive</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    style={{
                      padding: '16px',
                      backgroundColor: alert.severity === 'high' ? '#fee2e2' : alert.severity === 'medium' ? '#fef3c7' : '#e0e7ff',
                      borderLeft: `4px solid ${alert.severity === 'high' ? '#ef4444' : alert.severity === 'medium' ? '#f59e0b' : '#6366f1'}`,
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                      {alert.student_name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {alert.message}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {formatTimeIST(alert.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Students List */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              👥 Students ({students.length})
            </h3>

            {students.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                <div>No students joined yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Share the room code with students</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {students.map(student => (
                  <div
                    key={student.id}
                    style={{
                      padding: '16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Last update: {formatTimeIST(student.last_update)}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 16px',
                      backgroundColor:
                        student.status === 'attentive' ? '#dcfce7' :
                        student.status === 'drowsy' ? '#fef3c7' :
                        student.status === 'looking_away' ? '#fee2e2' : '#f3f4f6',
                      color:
                        student.status === 'attentive' ? '#166534' :
                        student.status === 'drowsy' ? '#92400e' :
                        student.status === 'looking_away' ? '#991b1b' : '#374151',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {student.status === 'attentive' ? '✅ Attentive' :
                       student.status === 'drowsy' ? '😴 Drowsy' :
                       student.status === 'looking_away' ? '👀 Looking Away' : '❓ No Face'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Student Cameras */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              📹 Live Student Cameras ({Object.keys(studentFrames).length})
            </h3>

            {Object.keys(studentFrames).length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#9ca3af',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📹</div>
                <div>No camera feeds yet</div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '16px'
              }}>
                {Object.entries(studentFrames).map(([studentId, frame]) => {
                  const student = students.find(s => s.id === studentId);
                  return (
                    <div key={studentId} style={{
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '3px solid #e5e7eb'
                    }}>
                      <div style={{
                        padding: '8px',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {student?.name || 'Student'}
                      </div>
                      <img
                        src={frame}
                        alt={student?.name}
                        style={{
                          width: '100%',
                          height: 'auto',
                          display: 'block'
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 240px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              💬 Chat
            </h3>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px'
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
                      border: `2px solid ${msg.user_type === 'teacher' ? '#3b82f6' : '#e5e7eb'}`
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                      {msg.user_name}
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
                  outline: 'none'
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
                  cursor: messageInput.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}