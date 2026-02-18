import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: '24px',
        padding: '48px',
        maxWidth: '600px',
        width: '100%',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          fontSize: '72px',
          marginBottom: '20px',
          textAlign: 'center',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))',
        }}>
          🎓
        </div>
        
        <h1 style={{
          fontSize: '38px',
          fontWeight: 'bold',
          color: '#1a1a2e',
          marginBottom: '12px',
          textAlign: 'center',
          letterSpacing: '-0.5px',
        }}>
          Live Feedback System
        </h1>
        
        <p style={{
          fontSize: '16px',
          color: '#64748b',
          marginBottom: '40px',
          lineHeight: '1.7',
          textAlign: 'center',
        }}>
          Real-time attention monitoring with AI-powered detection for online classes
        </p>

        {/* Feature Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '40px',
        }}>
          <div style={{
            padding: '20px 12px',
            backgroundColor: '#eff6ff',
            borderRadius: '12px',
            textAlign: 'center',
            border: '2px solid #dbeafe',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👁️</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e40af' }}>
              Gaze Detection
            </div>
          </div>
          
          <div style={{
            padding: '20px 12px',
            backgroundColor: '#fef3c7',
            borderRadius: '12px',
            textAlign: 'center',
            border: '2px solid #fde68a',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>😴</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e' }}>
              Drowsiness Alert
            </div>
          </div>
          
          <div style={{
            padding: '20px 12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '12px',
            textAlign: 'center',
            border: '2px solid #bbf7d0',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📹</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>
              Live Camera
            </div>
          </div>
        </div>

        {/* Role Selection */}
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '24px',
          borderRadius: '16px',
          marginBottom: '24px',
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#1e293b',
            marginBottom: '20px',
            textAlign: 'center',
          }}>
            Choose Your Role
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
          }}>
            {/* Student Button */}
            <button
              onClick={() => navigate('/student')}
              style={{
                padding: '24px 20px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-4px)';
                e.target.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.5)';
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.4)';
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎓</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                Join as Student
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                Enter room code to join class
              </div>
            </button>

            {/* Teacher Button */}
            <button
              onClick={() => navigate('/teacher')}
              style={{
                padding: '24px 20px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-4px)';
                e.target.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.5)';
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 14px rgba(139, 92, 246, 0.4)';
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>👨‍🏫</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                Enter as Teacher
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                Create class and monitor students
              </div>
            </button>
          </div>
        </div>

        {/* Camera Notice */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#fef3c7',
          borderRadius: '12px',
          border: '2px solid #fde68a',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}>
          <div style={{ fontSize: '20px', marginTop: '2px' }}>📷</div>
          <div>
            <div style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#92400e',
              marginBottom: '6px',
            }}>
              Camera Access Required
            </div>
            <ul style={{
              fontSize: '12px',
              color: '#78350f',
              margin: 0,
              paddingLeft: '20px',
              lineHeight: '1.8',
            }}>
              <li>Your camera feed is processed locally in real-time using AI</li>
              <li>Students see live feeds only during active session</li>
              <li>Teachers see live feeds only during active session</li>
              <li>All connections are secure via WebSocket encryption</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '2px solid #e2e8f0',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#94a3b8',
            marginBottom: '8px',
          }}>
            Built using WebRTC + React + MediaPipe
          </div>
          <div style={{
            fontSize: '11px',
            color: '#cbd5e1',
          }}>
            Real-time AI Detection • Live Streaming • Instant Alerts
          </div>
        </div>
      </div>
    </div>
  );
}