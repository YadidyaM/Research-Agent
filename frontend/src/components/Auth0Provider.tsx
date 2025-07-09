import React from 'react';
import { Auth0Provider } from '@auth0/auth0-react';
import { auth0Config } from '../config/auth0';

interface Auth0ProviderWrapperProps {
  children: React.ReactNode;
}

const Auth0ProviderWrapper: React.FC<Auth0ProviderWrapperProps> = ({ children }) => {
  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        redirect_uri: auth0Config.redirectUri,
        audience: auth0Config.audience,
        scope: auth0Config.scope,
      }}
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0ProviderWrapper; 