import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import styled from 'styled-components';

const AuthButton = styled.button`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    opacity: 0.8;
  }
`;

const LoginButton = styled(AuthButton)`
  background: #dc2626;
  color: white;
  
  &:hover {
    background: #b91c1c;
  }
`;

const LogoutButton = styled(AuthButton)`
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  
  &:hover {
    background: #e5e7eb;
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #374151;
`;

const UserAvatar = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
`;

const UserName = styled.span`
  font-weight: 500;
`;

export const LoginButtonComponent: React.FC = () => {
  const { loginWithRedirect } = useAuth0();

  return (
    <LoginButton onClick={() => loginWithRedirect()}>
      Log In
    </LoginButton>
  );
};

export const LogoutButtonComponent: React.FC = () => {
  const { logout } = useAuth0();

  return (
    <LogoutButton onClick={() => logout({ 
      logoutParams: { returnTo: window.location.origin } 
    })}>
      Log Out
    </LogoutButton>
  );
};

export const UserProfile: React.FC = () => {
  const { user } = useAuth0();

  if (!user) return null;

  return (
    <UserInfo>
      {user.picture && (
        <UserAvatar src={user.picture} alt={user.name} />
      )}
      <UserName>{user.name}</UserName>
    </UserInfo>
  );
};

export const AuthenticationButton: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) return <div>Loading...</div>;

  return isAuthenticated ? <LogoutButtonComponent /> : <LoginButtonComponent />;
}; 