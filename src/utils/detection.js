// Eye landmark indices for MediaPipe FaceMesh
const LEFT_EYE_INDICES = {
  upper: 159,
  lower: 145,
  left: 33,
  right: 133
};

const RIGHT_EYE_INDICES = {
  upper: 386,
  lower: 374,
  left: 362,
  right: 263
};

const NOSE_TIP = 1;

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function classifyAttention(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return { status: 'no_face', confidence: 0 };
  }

  try {
    // Get eye landmarks
    const leftUpper = landmarks[LEFT_EYE_INDICES.upper];
    const leftLower = landmarks[LEFT_EYE_INDICES.lower];
    const leftLeft = landmarks[LEFT_EYE_INDICES.left];
    const leftRight = landmarks[LEFT_EYE_INDICES.right];

    const rightUpper = landmarks[RIGHT_EYE_INDICES.upper];
    const rightLower = landmarks[RIGHT_EYE_INDICES.lower];
    const rightLeft = landmarks[RIGHT_EYE_INDICES.left];
    const rightRight = landmarks[RIGHT_EYE_INDICES.right];

    const nose = landmarks[NOSE_TIP];

    // Calculate Eye Aspect Ratio (EAR)
    const leftEAR = distance(leftUpper, leftLower) / distance(leftLeft, leftRight);
    const rightEAR = distance(rightUpper, rightLower) / distance(rightLeft, rightRight);
    const ear = (leftEAR + rightEAR) / 2;

    // Get nose position (normalized 0-1)
    const nose_x = nose.x;
    const nose_y = nose.y;

    // Send to backend for analysis
    return {
      status: 'processing',
      confidence: 1.0,
      data: {
        ear: ear,
        nose_x: nose_x,
        nose_y: nose_y
      }
    };

  } catch (error) {
    console.error('Detection error:', error);
    return { status: 'no_face', confidence: 0 };
  }
}

export function getStatusColor(status) {
  const colors = {
    attentive: '#22c55e',      // Green
    looking_away: '#f59e0b',   // Orange
    drowsy: '#ef4444',         // Red
    no_face: '#6b7280',        // Gray
    processing: '#3b82f6'      // Blue
  };
  return colors[status] || '#6b7280';
}

export function getStatusLabel(status) {
  const labels = {
    attentive: 'ATTENTIVE',
    looking_away: 'LOOKING AWAY',
    drowsy: 'DROWSY',
    no_face: 'NO FACE',
    processing: 'DETECTING...'
  };
  return labels[status] || 'UNKNOWN';
}

export function formatTimeIST(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatTimeAgoIST(timestamp) {
  if (!timestamp) return 'Just now';
  
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  
  if (diffSecs < 10) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit'
  });
}