/**
 * Get color based on student attention status
 */
export const getStatusColor = (status) => {
  const colors = {
    attentive: '#22c55e',      // Green
    looking_away: '#f59e0b',   // Orange
    drowsy: '#ef4444',         // Red
    no_face: '#6b7280',        // Gray
  };
  return colors[status] || '#6b7280';
};

/**
 * Get human-readable label for status
 */
export const getStatusLabel = (status) => {
  const labels = {
    attentive: 'Attentive',
    looking_away: 'Looking Away',
    drowsy: 'Drowsy',
    no_face: 'No Face Detected',
  };
  return labels[status] || 'Unknown';
};

/**
 * Format timestamp to "X seconds/minutes/hours ago" in IST
 */
export const formatTimeAgoIST = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  try {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);

    if (diffInSeconds < 0) return 'just now';
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  } catch (error) {
    console.error('Error formatting time ago:', error);
    return 'N/A';
  }
};

/**
 * Format timestamp to IST time (HH:MM AM/PM)
 */
export const formatTimeIST = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    console.error('Error formatting time IST:', error);
    return 'N/A';
  }
};

/**
 * Format full date and time in IST
 */
export const formatFullDateTimeIST = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    console.error('Error formatting full date time:', error);
    return 'N/A';
  }
};