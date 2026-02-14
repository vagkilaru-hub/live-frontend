import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import StudentPage from './pages/StudentPage';
import TeacherPage from './pages/TeacherPage';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/student" element={<StudentPage />} />
                <Route path="/teacher" element={<TeacherPage />} />
            </Routes>
        </Router>
    );
}

export default App;