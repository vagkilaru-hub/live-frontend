import { useNavigate } from 'react-router-dom';

export default function HomePage() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
        }}>
            <div style={{ maxWidth: '900px', width: '100%', textAlign: 'center' }}>
                {/* Title */}
                <div style={{ marginBottom: '48px' }}>
                    <h1 style={{
                        fontSize: '56px',
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: '20px',
                        textShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
                    }}>
                        Live Feedback System
                    </h1>
                    <p style={{
                        fontSize: '20px',
                        color: 'rgba(255, 255, 255, 0.95)',
                        maxWidth: '600px',
                        margin: '0 auto',
                        lineHeight: '1.6',
                    }}>
                        Real-time attention monitoring with AI-powered detection for online classes
                    </p>
                </div>

                {/* Feature Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '24px',
                    marginBottom: '48px',
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '32px',
                        borderRadius: '20px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                    }}>
                        <div style={{ fontSize: '56px', marginBottom: '16px' }}>👁️</div>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                            Gaze Detection
                        </h3>
                        <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: '1.6' }}>
                            AI detects when students look away from the screen in real-time
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        padding: '32px',
                        borderRadius: '20px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                    }}>
                        <div style={{ fontSize: '56px', marginBottom: '16px' }}>😴</div>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                            Drowsiness Alert
                        </h3>
                        <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: '1.6' }}>
                            Identifies signs of sleepiness and automatically alerts teacher
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        padding: '32px',
                        borderRadius: '20px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
                    }}>
                        <div style={{ fontSize: '56px', marginBottom: '16px' }}>📹</div>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
                            Live Camera Feed
                        </h3>
                        <p style={{ fontSize: '15px', color: '#6b7280', lineHeight: '1.6' }}>
                            Teacher can view all student cameras in real-time grid view
                        </p>
                    </div>
                </div>

                {/* Role Selection */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '48px',
                    borderRadius: '24px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                }}>
                    <h2 style={{
                        fontSize: '32px',
                        fontWeight: '700',
                        marginBottom: '32px',
                        color: '#111827',
                    }}>
                        Choose Your Role
                    </h2>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '24px',
                    }}>
                        {/* STUDENT BUTTON */}
                        <button
                            onClick={() => navigate('/student')}
                            style={{
                                padding: '40px 32px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '20px',
                                fontWeight: '700',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 6px 12px rgba(59, 130, 246, 0.4)',
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#2563eb';
                                e.target.style.transform = 'translateY(-6px)';
                                e.target.style.boxShadow = '0 12px 24px rgba(59, 130, 246, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#3b82f6';
                                e.target.style.transform = 'translateY(0)';
                                e.target.style.boxShadow = '0 6px 12px rgba(59, 130, 246, 0.4)';
                            }}
                        >
                            <div style={{ fontSize: '64px', marginBottom: '12px' }}>🎓</div>
                            <div>Join as Student</div>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: '400',
                                marginTop: '12px',
                                opacity: 0.9,
                            }}>
                                Enter room code to join class
                            </div>
                        </button>

                        {/* TEACHER BUTTON */}
                        <button
                            onClick={() => navigate('/teacher')}
                            style={{
                                padding: '40px 32px',
                                backgroundColor: '#8b5cf6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '20px',
                                fontWeight: '700',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 6px 12px rgba(139, 92, 246, 0.4)',
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#7c3aed';
                                e.target.style.transform = 'translateY(-6px)';
                                e.target.style.boxShadow = '0 12px 24px rgba(139, 92, 246, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = '#8b5cf6';
                                e.target.style.transform = 'translateY(0)';
                                e.target.style.boxShadow = '0 6px 12px rgba(139, 92, 246, 0.4)';
                            }}
                        >
                            <div style={{ fontSize: '64px', marginBottom: '12px' }}>👨‍🏫</div>
                            <div>Enter as Teacher</div>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: '400',
                                marginTop: '12px',
                                opacity: 0.9,
                            }}>
                                Create class and monitor students
                            </div>
                        </button>
                    </div>

                    {/* Important Note */}
                    <div style={{
                        marginTop: '40px',
                        padding: '20px',
                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                        borderRadius: '16px',
                        fontSize: '15px',
                        color: '#92400e',
                        lineHeight: '1.7',
                        textAlign: 'left',
                    }}>
                        <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '16px' }}>
                            📹 Camera Access Required
                        </div>
                        <div>
                            • Your camera feed is processed locally in real-time using AI<br />
                            • No video is recorded or stored on any server<br />
                            • Teachers see live feeds only during active session<br />
                            • All connections are secure via WebSocket encryption
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    marginTop: '40px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '14px',
                }}>
                    <div style={{ marginBottom: '8px' }}>
                        Built with ❤️ using FastAPI + React + MediaPipe
                    </div>
                    <div>
                        Real-time AI Detection • Live Streaming • Instant Alerts
                    </div>
                </div>
            </div>
        </div>
    );
}