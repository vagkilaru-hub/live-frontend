import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebSocketManager } from '../utils/websocket';
import { getStatusColor, getStatusLabel, formatTimeAgoIST, formatTimeIST } from '../utils/detection';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

const ALERT_SEVERITY_COLORS = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#ef4444',
};

export default function TeacherPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [studentFrames, setStudentFrames] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [stats, setStats] = useState({ total: 0, attentive: 0, needsAttention: 0 });
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [showChat, setShowChat] = useState(false);

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const MAX_ALERTS = 50;

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
            last_update: message.data.timestamp,
            alerts_count: 0,
          }];
        });
        break;

      case 'student_leave':
        console.log('👋 Student left:', message.data.student_name);
        setStudents(prev => prev.filter(s => s.id !== message.data.student_id));
        setAlerts(prev => prev.filter(a => a.student_id !== message.data.student_id));
        setStudentFrames(prev => {
          const newFrames = { ...prev };
          delete newFrames[message.data.student_id];
          return newFrames;
        });
        break;

      case 'attention_update':
        console.log('📊 Attention update:', message.data.student_name, '→', message.data.status);
        setStudents(prev => prev.map(student => {
          if (student.id === message.data.student_id) {
            return {
              ...student,
              status: message.data.status,
              last_update: message.data.timestamp,
            };
          }
          return student;
        }));
        break;

      case 'camera_frame':
        setStudentFrames(prev => ({
          ...prev,
          [message.data.student_id]: message.data.frame
        }));
        break;

      case 'alert':
        console.log('🚨 ALERT RECEIVED:', message.data);
        setAlerts(prev => {
          const exists = prev.some(a => a.student_id === message.data.student_id);
          if (exists) {
            console.log('⚠️ Alert already exists, skipping duplicate');
            return prev;
          }

          const newAlert = {
            id: `${message.data.student_id}-${Date.now()}`,
            student_id: message.data.student_id,
            student_name: message.data.student_name,
            alert_type: message.data.alert_type,
            message: message.data.message,
            severity: message.data.severity,
            timestamp: message.data.timestamp,
          };

          console.log('✅ NEW ALERT ADDED:', newAlert);
          return [newAlert, ...prev].slice(0, MAX_ALERTS);
        });

        setStudents(prev => prev.map(student => {
          if (student.id === message.data.student_id) {
            return { ...student, alerts_count: (student.alerts_count || 0) + 1 };
          }
          return student;
        }));
        break;

      case 'clear_alert':
        console.log('✅ CLEAR ALERT:', message.data.student_id);
        setAlerts(prev => prev.filter(a => a.student_id !== message.data.student_id));
        break;

      case 'chat_message':
        setMessages(prev => [...prev, message.data]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        break;

      default:
        console.log('Unknown message type:', message.type);
        break;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const connectWebSocket = () => {
      if (!mounted) return;

      console.log('🔌 Connecting teacher WebSocket...');
      const wsUrl = `${WS_URL}/ws/teacher?name=Teacher`;
      wsRef.current = new WebSocketManager(wsUrl, handleWebSocketMessage);

      wsRef.current.connect()
        .then(() => {
          if (mounted) {
            console.log('✅ Teacher connected');
            setIsConnected(true);
          }
        })
        .catch((err) => {
          console.error('❌ Connection failed:', err);
          if (mounted) {
            setIsConnected(false);
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
          }
        });
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    const total = students.length;
    const attentive = students.filter(s => s.status === 'attentive').length;
    const needsAttention = total - attentive;
    setStats({ total, attentive, needsAttention });
  }, [students]);

  const clearAlerts = () => {
    console.log('🧹 Clearing all alerts');
    setAlerts([]);
  };

  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert(`Room code ${roomId} copied!`);
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

  const handleLeaveClass = () => {
    if (window.confirm('End class for all students?')) {
      if (wsRef.current) wsRef.current.disconnect();
      navigate('/');
    }
  };

  const getStatusIcon = (status) => {
    const icons = {
      attentive: '✓',
      looking_away: '👀',
      drowsy: '😴',
      no_face: '❌',
    };
    return icons[status] || '○';
  };

  const getSeverityIcon = (severity) => {
    const icons = { low: 'ℹ️', medium: '⚠️', high: '🚨' };
    return icons[severity] || 'ℹ️';
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
        padding: '16px 24px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 }}>
              Live Feedback System
            </h1>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
              Teacher Dashboard
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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

            {roomId && (
              <div style={{
                padding: '6px 14px',
                backgroundColor: '#eff6ff',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                Room Code: <span style={{ fontSize: '16px', letterSpacing: '2px', fontFamily: 'monospace' }}>{roomId}</span>
                <button
                  onClick={copyRoomCode}
                  style={{
                    padding: '2px 8px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}
                >
                  Copy
                </button>
              </div>
            )}

            <button
              onClick={() => setShowChat(!showChat)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
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
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              Leave Class
            </button>
          </div>
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
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
            Total Students
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>
            {stats.total}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
            Attentive
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e' }}>
            {stats.attentive}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
            Needs Attention
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
            {stats.needsAttention}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>
            Active Alerts
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>
            {alerts.length}
          </div>
        </div>
      </div>

      {/* Chat Sidebar */}
      {showChat && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '320px',
          height: 'calc(100vh - 40px)',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
              💬 Chat
            </h3>
            <button
              onClick={() => setShowChat(false)}
              style={{
                padding: '4px 10px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', backgroundColor: '#f9fafb' }}>
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
                    padding: '10px',
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

          <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '10px',
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
                padding: '10px 18px',
                background: messageInput.trim() ? '#3b82f6' : '#d1d5db',
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

      {/* Side by Side: Students (left) and Real-Time Alerts (right) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px',
      }}>
        {/* Students Section - LEFT */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '16px',
          }}>
            👥 Students ({students.length})
          </h3>

          {students.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: '#9ca3af',
              fontSize: '13px',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
              <div>No students joined yet</div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>Share the room code with students</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
              {students.map((student) => (
                <div
                  key={student.id}
                  style={{
                    padding: '14px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: `2px solid ${getStatusColor(student.status)}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                        {formatTimeAgoIST(student.last_update)}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      backgroundColor: getStatusColor(student.status),
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}>
                      {getStatusIcon(student.status)} {getStatusLabel(student.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Real-Time Alerts Section - RIGHT */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#111827',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              🚨 Real-Time Alerts
              {alerts.length > 0 && (
                <span style={{
                  padding: '2px 10px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}>
                  {alerts.length}
                </span>
              )}
            </h3>
            {alerts.length > 0 && (
              <button
                onClick={clearAlerts}
                style={{
                  padding: '6px 14px',
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

          <div style={{
            maxHeight: '500px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {alerts.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                color: '#9ca3af',
                fontSize: '13px',
              }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>✓</div>
                <div>No active alerts</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>All students are attentive</div>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '12px',
                    backgroundColor: '#fef3c7',
                    border: `2px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`,
                    borderLeft: `4px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`,
                    borderRadius: '8px',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#111827',
                    }}>
                      {getSeverityIcon(alert.severity)} {alert.student_name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      {formatTimeAgoIST(alert.timestamp)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#4b5563',
                  }}>
                    {alert.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live Student Cameras - BOTTOM */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          📹 Live Student Cameras ({students.length})
        </h3>

        {students.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '250px',
            color: '#9ca3af',
            fontSize: '13px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📹</div>
            <div>No camera feeds yet</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>Waiting for students to join...</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '16px',
          }}>
            {students.map((student) => (
              <div
                key={student.id}
                style={{
                  border: `2px solid ${getStatusColor(student.status)}`,
                  borderRadius: '10px',
                  backgroundColor: '#fafafa',
                  padding: '10px',
                }}
              >
                {studentFrames[student.id] ? (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={studentFrames[student.id]}
                      alt={student.name}
                      style={{
                        width: '100%',
                        height: '180px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        marginBottom: '10px',
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      padding: '3px 8px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: '600',
                    }}>
                      ● LIVE
                    </div>
                  </div>
                ) : (
                  <div style={{
                    width: '100%',
                    height: '180px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '8px',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '6px' }}>📹</div>
                      <div style={{ fontSize: '12px' }}>Waiting for camera...</div>
                    </div>
                  </div>
                )}

                <div style={{
                  fontWeight: '600',
                  fontSize: '13px',
                  color: '#111827',
                  marginBottom: '8px',
                  textAlign: 'center',
                }}>
                  {student.name}
                </div>

                <div style={{
                  padding: '5px 10px',
                  backgroundColor: getStatusColor(student.status),
                  color: 'white',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  textAlign: 'center',
                }}>
                  {getStatusIcon(student.status)} {getStatusLabel(student.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}