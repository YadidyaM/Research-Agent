// API Configuration for Frontend

export const API_CONFIG = {
  // Use environment variable if available, fallback to production Heroku URL
  BASE_URL: process.env.REACT_APP_API_URL || 'https://research-agent-backend-v1-3d17a0323ece.herokuapp.com',
  
  // Development fallback
  DEV_URL: 'http://localhost:3001',
  
  // Get the appropriate base URL based on environment
  getBaseUrl: (): string => {
    // In development, check if local server is available, otherwise use production
    if (process.env.NODE_ENV === 'development') {
      return process.env.REACT_APP_API_URL || API_CONFIG.DEV_URL;
    }
    return API_CONFIG.BASE_URL;
  },
  
  // API endpoints
  ENDPOINTS: {
    CHAT: '/api/chat',
    CHAT_STREAM: '/api/chat/stream',
    RESEARCH: '/api/research',
    HEALTH: '/api/health',
    CONVERSATIONS: '/api/conversations',
    MEMORY: '/api/memory',
    CACHE: '/api/cache',
    ORCHESTRATOR: '/api/orchestrator'
  }
};

export default API_CONFIG; 