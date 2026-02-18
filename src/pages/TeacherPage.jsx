import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebSocketManager } from '../utils/websocket';
import { getStatusColor, getStatusLabel, formatTimeAgoIST, formatTimeIST } from '../utils/detection';
import TeacherCamera from '../components/TeacherCamera';
import AudioManager from '../components/AudioManager';

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
  const [showMyCamera, setShowMyCamera] = useState(false);
  const [stats, setStats] = useState({ total: 0, attentive: 0, needsAttention: 0 });
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [audioStatus, setAudioStatus] = useState({ enabled: false, muted: true, connected: false });
  const [lastMessage, setLastMessage] = useState('Waiting for messages...');

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const MAX_ALERTS = 50;

  const handleWebSocketMessage = useCallback((message) => {
    console.log('📨 Teacher received:', message.type);
    setLastMessage(`${message.type} - ${new Date().toLocaleTimeString()}`);

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
        console.log('🚨🚨🚨 ALERT RECEIVED FROM BACKEND:', message.data);

        setAlerts(prev => {
          // Check if alert already exists for this student
          const exists = prev.some(a => a.student_id === message.data.student_id);

          if (exists) {
            console.log('⚠️ Alert already exists for this student, skipping duplicate');
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

          console.log('✅✅✅ NEW ALERT ADDED TO DASHBOARD:', newAlert);
          const updatedAlerts = [newAlert, ...prev].slice(0, MAX_ALERTS);
          console.log('📊 Total alerts now:', updatedAlerts.length);
          return updatedAlerts;
        });

        setStudents(prev => prev.map(student => {
          if (student.id === message.data.student_id) {
            return { ...student, alerts_count: (student.alerts_count || 0) + 1 };
          }
          return student;
        }));
        break;

      case 'clear_alert':
        console.log('✅✅✅ CLEAR ALERT RECEIVED:', message.data.student_id);
        setAlerts(prev => {
          const filtered = prev.filter(a => a.student_id !== message.data.student_id);
          console.log('📊 Alerts after clearing:', filtered.length);
          return filtered;
        });
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

  // Debug logging when alerts change
  useEffect(() => {
    console.log('🔄 ALERTS STATE UPDATED:', alerts.length, 'alerts');
    alerts.forEach((alert, index) => {
      console.log(`  ${index + 1}. ${alert.student_name} - ${alert.alert_type} - ${alert.message}`);
    });
  }, [alerts]);

  // Update stats when students change
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
        padding: '20px 24px',
        marginBottom: '20px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: roomId ? '16px' : '0',
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
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ← Back to Home
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Connection Status */}
            <div style={{
              padding: '8px 16px',
              backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '500',
            }}>
              ● {isConnected ? 'Connected' : 'Reconnecting...'}
            </div>

            {/* Show My Camera */}
            <button
              onClick={() => setShowMyCamera(true)}
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
              📹 My Camera
            </button>

            {/* Audio Manager Component */}
            <AudioManager
              wsManager={wsRef.current}
              userId="teacher"
              userType="teacher"
              onStatusChange={(status) => {
                setAudioStatus(status);
                console.log('Teacher audio:', status);
              }}
            />

            {/* Chat */}
            <button
              onClick={() => setShowChat(!showChat)}
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

            {/* Leave Class */}
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
        {roomId ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderRadius: '12px',
            border: '3px solid #3b82f6',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <div>
              <div style={{
                fontSize: '13px',
                color: '#1e40af',
                marginBottom: '8px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                📋 ROOM CODE - SHARE WITH STUDENTS
              </div>
              <div style={{
                fontSize: '42px',
                fontWeight: 'bold',
                color: '#1e3a8a',
                letterSpacing: '8px',
                fontFamily: 'monospace',
              }}>
                {roomId}
              </div>
            </div>
            <button
              onClick={copyRoomCode}
              style={{
                padding: '14px 28px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: '600',
                boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)',
              }}
            >
              📋 Copy Code
            </button>
          </div>
        ) : (
          <div style={{
            padding: '16px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#92400e',
            textAlign: 'center',
            fontWeight: '500',
          }}>
            ⏳ Generating room code...
          </div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderRadius: '10px',
            border: '2px solid #3b82f6',
          }}>
            <div style={{ fontSize: '12px', color: '#1e40af', marginBottom: '4px', fontWeight: '600' }}>
              Total Students
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e3a8a' }}>
              {stats.total}
            </div>
          </div>

          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            borderRadius: '10px',
            border: '2px solid #22c55e',
          }}>
            <div style={{ fontSize: '12px', color: '#166534', marginBottom: '4px', fontWeight: '600' }}>
              Attentive
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#14532d' }}>
              {stats.attentive}
            </div>
          </div>

          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            borderRadius: '10px',
            border: '2px solid #ef4444',
          }}>
            <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '4px', fontWeight: '600' }}>
              Needs Attention
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#7f1d1d' }}>
              {stats.needsAttention}
            </div>
          </div>

          <div style={{
            padding: '16px',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            borderRadius: '10px',
            border: '2px solid #f59e0b',
          }}>
            <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px', fontWeight: '600' }}>
              Active Alerts
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#78350f' }}>
              {alerts.length}
            </div>
          </div>
        </div>
      </div>

      {/* DEBUG PANEL */}
      <div style={{
        backgroundColor: '#1f2937',
        color: '#10b981',
        padding: '12px 24px',
        marginBottom: '20px',
        borderRadius: '12px',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#60a5fa' }}>
          🔍 LIVE DEBUG:
        </div>
        <div style={{ color: '#a3e635' }}>
          Alerts in State: {alerts.length}
        </div>
        <div style={{ color: '#fbbf24', marginTop: '4px' }}>
          Last Message: {lastMessage}
        </div>
        <div style={{ color: '#f87171', marginTop: '4px' }}>
          Press F12 to see detailed console logs
        </div>
      </div>

      {/* Chat Sidebar */}
      {showChat && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '350px',
          height: 'calc(100vh - 40px)',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
        }}>
          <div style={{
            padding: '20px',
            borderBottom: '2px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
              💬 Chat
            </h3>
            <button
              onClick={() => setShowChat(false)}
              style={{
                padding: '6px 12px',
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

          <div style={{ padding: '16px', borderTop: '2px solid #e5e7eb', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type..."
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
                background: messageInput.trim() ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' : '#d1d5db',
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

      {/* MAIN DASHBOARD LAYOUT */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px',
      }}>
        {/* LEFT SIDE - Students List */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
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
              fontSize: '14px',
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>👥</div>
              <div>No students connected yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
              {students.map((student) => {
                const studentAlerts = alerts.filter(a => a.student_id === student.id);
                return (
                  <div
                    key={student.id}
                    style={{
                      padding: '16px',
                      backgroundColor: '#fafafa',
                      borderRadius: '12px',
                      border: `3px solid ${getStatusColor(student.status)}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          {student.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          ID: {student.id.substring(0, 10)}...
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                          Updated: {formatTimeAgoIST(student.last_update)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          padding: '8px 16px',
                          backgroundColor: getStatusColor(student.status),
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: '600',
                          marginBottom: '8px',
                        }}>
                          {getStatusIcon(student.status)} {getStatusLabel(student.status)}
                        </div>
                        {studentAlerts.length > 0 && (
                          <div style={{
                            padding: '4px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                          }}>
                            {studentAlerts.length} Alert{studentAlerts.length > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT SIDE - Real-Time Alerts */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#111827',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              🚨 Real-Time Alerts
              {alerts.length > 0 && (
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '14px',
                  animation: 'pulse 2s ease-in-out infinite',
                }}>
                  {alerts.length} Active
                </span>
              )}
            </h3>
            {alerts.length > 0 && (
              <button
                onClick={clearAlerts}
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
                Clear All
              </button>
            )}
          </div>

          <div style={{
            maxHeight: '600px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {alerts.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                color: '#9ca3af',
                fontSize: '14px',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                <div style={{ fontWeight: '600' }}>No active alerts</div>
                <div style={{ marginTop: '8px' }}>All students are attentive</div>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '16px',
                    backgroundColor: alert.alert_type === 'drowsy' ? '#fee2e2' : '#fef3c7',
                    border: `2px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`,
                    borderLeft: `6px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`,
                    borderRadius: '12px',
                    animation: 'slideIn 0.3s ease-out',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                  }}>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '4px'
                      }}>
                        {getSeverityIcon(alert.severity)} {alert.student_name}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {alert.alert_type === 'drowsy' ? 'Drowsy' : 'Distracted'}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {formatTimeAgoIST(alert.timestamp)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#4b5563',
                    fontWeight: '500'
                  }}>
                    {alert.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Cameras Section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          📹 Live Student Cameras ({students.length})
        </h3>

        {students.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '300px',
            color: '#9ca3af',
            fontSize: '14px',
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📹</div>
            <div style={{ fontWeight: '600' }}>No students connected</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}>
            {students.map((student) => (
              <div
                key={student.id}
                style={{
                  border: `3px solid ${getStatusColor(student.status)}`,
                  borderRadius: '12px',
                  backgroundColor: '#fafafa',
                  padding: '12px',
                }}
              >
                {studentFrames[student.id] ? (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={studentFrames[student.id]}
                      alt={student.name}
                      style={{
                        width: '100%',
                        height: '200px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        marginBottom: '12px',
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      padding: '4px 10px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '600',
                    }}>
                      ● LIVE
                    </div>
                  </div>
                ) : (
                  <div style={{
                    width: '100%',
                    height: '200px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '40px', marginBottom: '8px' }}>📹</div>
                      <div style={{ fontSize: '13px' }}>Waiting...</div>
                    </div>
                  </div>
                )}

                <div style={{
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#111827',
                  marginBottom: '8px',
                  textAlign: 'center',
                }}>
                  {student.name}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: getStatusColor(student.status),
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '600',
                }}>
                  <span>{getStatusIcon(student.status)}</span>
                  <span>{getStatusLabel(student.status)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Camera Modal */}
      {showMyCamera && <TeacherCamera onClose={() => setShowMyCamera(false)} wsManager={wsRef.current} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}