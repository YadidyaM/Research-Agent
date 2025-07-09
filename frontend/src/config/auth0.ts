export const auth0Config = {
  domain: process.env.REACT_APP_AUTH0_DOMAIN || 'your-domain.auth0.com',
  clientId: process.env.REACT_APP_AUTH0_CLIENT_ID || 'your-client-id',
  audience: process.env.REACT_APP_AUTH0_AUDIENCE || 'https://research-agent-backend-v1-3d17a0323ece.herokuapp.com/api',
  redirectUri: process.env.REACT_APP_AUTH0_REDIRECT_URI || window.location.origin,
  scope: 'openid profile email',
};

export default auth0Config; 