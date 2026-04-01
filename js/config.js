// Environment-aware API configuration
// Automatically detects whether we're in development or production

const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// In production, use relative URLs (same domain)
// In development, explicitly use localhost:5000
// Make these global by attaching to window
window.API_URL = isProduction ? '/api' : 'http://localhost:5000/api';
window.SOCKET_URL = isProduction ? window.location.origin : 'http://localhost:5000';

// Also create non-window versions for compatibility
const API_URL = window.API_URL;
const SOCKET_URL = window.SOCKET_URL;

console.log('Environment:', isProduction ? 'Production' : 'Development');
console.log('API URL:', API_URL);
console.log('Socket URL:', SOCKET_URL);
