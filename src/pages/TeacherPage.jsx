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
  const [lastMessage, setLastMessage] = useState('Waiting for messages...');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const MAX_ALERTS = 50;

  /* ================== WEBSOCKET ================== */

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

  /* ================== UI ================== */

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
    }}>

      {/* HEADER */}
      <div style={{
        backgroundColor: 'white',
        padding: '16px 24px',
        marginBottom: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1>Live Feedback System</h1>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{
            padding: '6px 14px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '16px'
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

      {/* STATS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <StatCard label="Total Students" value={stats.total} />
        <StatCard label="Attentive" value={stats.attentive} color="#22c55e" />
        <StatCard label="Needs Attention" value={stats.needsAttention} color="#f59e0b" />
        <StatCard label="Active Alerts" value={alerts.length} color="#ef4444" />
      </div>

      {/* DEBUG */}
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

      {/* SIDE BY SIDE */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px',
      }}>

        {/* STUDENTS */}
        <Panel title={`👥 Students (${students.length})`}>
          {students.map(student => (
            <div key={student.id}
              style={{
                padding: '14px',
                marginBottom: '12px',
                borderRadius: '8px',
                border: `2px solid ${getStatusColor(student.status)}`
              }}>
              <strong>{student.name}</strong>
              <div style={{
                marginTop: '6px',
                padding: '4px 10px',
                backgroundColor: getStatusColor(student.status),
                color: 'white',
                borderRadius: '6px',
                display: 'inline-block'
              }}>
                {getStatusIcon(student.status)} {getStatusLabel(student.status)}
              </div>
            </div>
          ))}
        </Panel>

        {/* ALERTS */}
        <Panel title={`🚨 Real-Time Alerts (${alerts.length})`}>
          {alerts.map(alert => (
            <div key={alert.id}
              style={{
                padding: '14px',
                marginBottom: '12px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                borderLeft: `5px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`
              }}>
              <strong>{getSeverityIcon(alert.severity)} {alert.student_name}</strong>
              <div style={{ marginTop: '4px' }}>{alert.message}</div>
            </div>
          ))}
        </Panel>
      </div>

      {/* STUDENT CAMERAS */}
      <Panel title={`📹 Live Student Cameras (${students.length})`}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '16px'
        }}>
          {students.map(student => (
            <div key={student.id}
              style={{
                border: `2px solid ${getStatusColor(student.status)}`,
                borderRadius: '8px',
                padding: '10px'
              }}>
              {studentFrames[student.id] && (
                <img
                  src={studentFrames[student.id]}
                  alt={student.name}
                  style={{
                    width: '100%',
                    height: '180px',
                    objectFit: 'cover',
                    borderRadius: '6px'
                  }}
                />
              )}
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                {student.name}
              </div>
            </div>
          ))}
        </div>
      </Panel>

    </div>
  );
}

/* ===== SMALL COMPONENTS ===== */

function Panel({ title, children }) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    }}>
      <h3 style={{ marginBottom: '16px' }}>{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ label, value, color = '#3b82f6' }) {
  return (
    <div style={{
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    }}>
      <div style={{ fontSize: '13px', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}