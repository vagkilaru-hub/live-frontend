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
  const [lastMessage, setLastMessage] = useState('Waiting for messages...');

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const MAX_ALERTS = 50;

  const handleWebSocketMessage = useCallback((message) => {
    setLastMessage(`${message.type} - ${new Date().toLocaleTimeString()}`);

    switch (message.type) {

      case 'room_created':
        setRoomId(message.data.room_id);
        setStudents(message.data.students || []);
        break;

      case 'student_join':
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
        setStudents(prev => prev.filter(s => s.id !== message.data.student_id));
        setAlerts(prev => prev.filter(a => a.student_id !== message.data.student_id));
        setStudentFrames(prev => {
          const newFrames = { ...prev };
          delete newFrames[message.data.student_id];
          return newFrames;
        });
        break;

      case 'attention_update':
        setStudents(prev =>
          prev.map(student =>
            student.id === message.data.student_id
              ? { ...student, status: message.data.status, last_update: message.data.timestamp }
              : student
          )
        );
        break;

      case 'camera_frame':
        setStudentFrames(prev => ({
          ...prev,
          [message.data.student_id]: message.data.frame
        }));
        break;

      case 'alert':
        setAlerts(prev => {
          const exists = prev.some(a => a.student_id === message.data.student_id);
          if (exists) return prev;
          return [{
            id: `${message.data.student_id}-${Date.now()}`,
            ...message.data
          }, ...prev].slice(0, MAX_ALERTS);
        });
        break;

      case 'chat_message':
        setMessages(prev => [...prev, message.data]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = `${WS_URL}/ws/teacher?name=Teacher`;
      wsRef.current = new WebSocketManager(wsUrl, handleWebSocketMessage);

      wsRef.current.connect()
        .then(() => setIsConnected(true))
        .catch(() => {
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        });
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.disconnect();
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    const total = students.length;
    const attentive = students.filter(s => s.status === 'attentive').length;
    setStats({ total, attentive, needsAttention: total - attentive });
  }, [students]);

  const handleLeaveClass = () => {
    if (window.confirm('End class for all students?')) {
      if (wsRef.current) wsRef.current.disconnect();
      navigate('/');
    }
  };

  const getStatusIcon = (status) => ({
    attentive: '✓',
    looking_away: '👀',
    drowsy: '😴',
    no_face: '❌',
  }[status] || '○');

  const getSeverityIcon = (severity) => ({
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨'
  }[severity] || 'ℹ️');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)',
      padding: '20px',
    }}>

      {/* HEADER */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px 24px',
        marginBottom: '20px',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
          Live Feedback System
        </h1>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{
            padding: '8px 16px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '20px'
          }}>
            ● {isConnected ? 'Connected' : 'Reconnecting...'}
          </div>

          <button
            onClick={handleLeaveClass}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}>
            Leave Class
          </button>
        </div>
      </div>

      {/* ROOM CODE */}
      {roomId && (
        <div style={{
          padding: '20px',
          background: '#dbeafe',
          borderRadius: '12px',
          marginBottom: '20px',
          textAlign: 'center',
          fontSize: '42px',
          fontWeight: 'bold',
          letterSpacing: '8px',
          fontFamily: 'monospace'
        }}>
          {roomId}
        </div>
      )}

      {/* DEBUG PANEL */}
      <div style={{
        backgroundColor: '#1f2937',
        color: '#10b981',
        padding: '12px',
        borderRadius: '12px',
        marginBottom: '20px',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}>
        Alerts: {alerts.length} | Students: {students.length}
        <br />
        Last: {lastMessage}
      </div>

      {/* SIDE BY SIDE LAYOUT */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px',
      }}>

        {/* STUDENTS PANEL */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}>
          <h3>👥 Students ({students.length})</h3>

          {students.map(student => (
            <div key={student.id}
              style={{
                padding: '16px',
                marginTop: '12px',
                borderRadius: '12px',
                border: `3px solid ${getStatusColor(student.status)}`
              }}>
              <div style={{ fontWeight: '600' }}>{student.name}</div>
              <div style={{
                marginTop: '6px',
                padding: '6px 12px',
                backgroundColor: getStatusColor(student.status),
                color: 'white',
                borderRadius: '8px',
                display: 'inline-block'
              }}>
                {getStatusIcon(student.status)} {getStatusLabel(student.status)}
              </div>
            </div>
          ))}
        </div>

        {/* ALERTS PANEL */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}>
          <h3>🚨 Real-Time Alerts ({alerts.length})</h3>

          {alerts.map(alert => (
            <div key={alert.id}
              style={{
                padding: '16px',
                marginTop: '12px',
                backgroundColor: '#fef3c7',
                borderRadius: '12px',
                borderLeft: `6px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`
              }}>
              <strong>{getSeverityIcon(alert.severity)} {alert.student_name}</strong>
              <div style={{ marginTop: '6px' }}>{alert.message}</div>
            </div>
          ))}
        </div>
      </div>

      {/* STUDENT CAMERAS */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3>📹 Live Student Cameras ({students.length})</h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          marginTop: '16px'
        }}>
          {students.map(student => (
            <div key={student.id}
              style={{
                border: `3px solid ${getStatusColor(student.status)}`,
                borderRadius: '12px',
                padding: '12px'
              }}>
              {studentFrames[student.id] && (
                <img
                  src={studentFrames[student.id]}
                  alt={student.name}
                  style={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: '8px'
                  }}
                />
              )}
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                {student.name}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}