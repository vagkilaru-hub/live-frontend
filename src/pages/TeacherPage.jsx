import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebSocketManager } from '../utils/websocket';
import { getStatusColor, getStatusLabel, formatTimeAgoIST } from '../utils/detection';

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
  const [lastMessage, setLastMessage] = useState('Waiting...');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  /* ================= WEBSOCKET ================= */

  const handleWebSocketMessage = useCallback((message) => {
    setLastMessage(message.type);

    switch (message.type) {

      case 'room_created':
        setRoomId(message.data.room_id);
        break;

      case 'student_join':
        setStudents(prev => [
          ...prev,
          {
            id: message.data.student_id,
            name: message.data.student_name,
            status: 'attentive',
            last_update: message.data.timestamp
          }
        ]);
        break;

      case 'attention_update':
        setStudents(prev =>
          prev.map(s =>
            s.id === message.data.student_id
              ? { ...s, status: message.data.status }
              : s
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
        setAlerts(prev => [{
          id: `${message.data.student_id}-${Date.now()}`,
          ...message.data
        }, ...prev]);
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    const connect = () => {
      wsRef.current = new WebSocketManager(
        `${WS_URL}/ws/teacher?name=Teacher`,
        handleWebSocketMessage
      );

      wsRef.current.connect()
        .then(() => setIsConnected(true))
        .catch(() => {
          setIsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        });
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.disconnect();
    };
  }, [handleWebSocketMessage]);

  useEffect(() => {
    const total = students.length;
    const attentive = students.filter(s => s.status === 'attentive').length;
    setStats({
      total,
      attentive,
      needsAttention: total - attentive
    });
  }, [students]);

  const handleLeave = () => {
    if (wsRef.current) wsRef.current.disconnect();
    navigate('/');
  };

  const getStatusIcon = (status) => ({
    attentive: '✓',
    looking_away: '👀',
    drowsy: '😴',
    no_face: '❌'
  }[status] || '○');

  const getSeverityIcon = (severity) => ({
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨'
  }[severity] || 'ℹ️');

  /* ================= UI ================= */

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>

      {/* HEADER */}
      <div style={{
        background: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <h2>Live Feedback System</h2>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{
            padding: '6px 14px',
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
            borderRadius: '16px'
          }}>
            ● {isConnected ? 'Connected' : 'Reconnecting'}
          </div>

          <button
            onClick={handleLeave}
            style={{
              padding: '8px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px'
            }}>
            Leave Class
          </button>
        </div>
      </div>

      {/* STATS */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <Stat label="Total Students" value={stats.total} />
        <Stat label="Attentive" value={stats.attentive} color="#22c55e" />
        <Stat label="Needs Attention" value={stats.needsAttention} color="#f59e0b" />
        <Stat label="Active Alerts" value={alerts.length} color="#ef4444" />
      </div>

      {/* DEBUG */}
      <div style={{
        background: '#1f2937',
        color: '#10b981',
        padding: '10px',
        borderRadius: '10px',
        marginBottom: '20px',
        fontFamily: 'monospace',
        fontSize: '12px'
      }}>
        Alerts: {alerts.length} | Students: {students.length} | Last: {lastMessage}
      </div>

      {/* SIDE BY SIDE */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '20px'
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
                background: '#fef3c7',
                borderRadius: '8px',
                borderLeft: `5px solid ${ALERT_SEVERITY_COLORS[alert.severity]}`
              }}>
              <strong>
                {getSeverityIcon(alert.severity)} {alert.student_name}
              </strong>
              <div style={{ marginTop: '4px' }}>
                {alert.message}
              </div>
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

/* ===== COMPONENTS ===== */

function Panel({ title, children }) {
  return (
    <div style={{
      flex: 1,
      background: 'white',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ marginBottom: '16px' }}>{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value, color = '#3b82f6' }) {
  return (
    <div style={{
      flex: 1,
      background: 'white',
      padding: '16px',
      borderRadius: '10px'
    }}>
      <div style={{ fontSize: '13px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 'bold', color }}>
        {value}
      </div>
    </div>
  );
}