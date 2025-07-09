import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import styled from 'styled-components';
import API_CONFIG from '../config/api';

const TrialContainer = styled.div`
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
`;

const TrialHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const TrialTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
`;

const TrialStatus = styled.div<{ status: 'active' | 'expired' | 'paid' }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  
  ${props => {
    switch (props.status) {
      case 'active':
        return 'background: #d1fae5; color: #065f46;';
      case 'expired':
        return 'background: #fee2e2; color: #991b1b;';
      case 'paid':
        return 'background: #dbeafe; color: #1e40af;';
      default:
        return 'background: #f3f4f6; color: #374151;';
    }
  }}
`;

const TrialInfo = styled.div`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
`;

const PaymentButton = styled.button`
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #b91c1c;
  }
  
  &:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
`;

const UsageStats = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
`;

const UsageStat = styled.div`
  text-align: center;
`;

const UsageNumber = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: #374151;
`;

const UsageLabel = styled.div`
  font-size: 12px;
  color: #6b7280;
`;

interface UserUsage {
  trialUsed: boolean;
  trialExpiry: string;
  isPaid: boolean;
  queriesUsed: number;
  maxQueries: number;
  subscriptionExpiry?: string;
}

export const TrialSystem: React.FC = () => {
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0();
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchUsage();
    }
  }, [isAuthenticated, user]);

  const fetchUsage = async () => {
    try {
      const token = await getAccessTokenSilently();
      const baseUrl = API_CONFIG.getBaseUrl();
      const response = await fetch(`${baseUrl}/api/user/usage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    try {
      const token = await getAccessTokenSilently();
      const baseUrl = API_CONFIG.getBaseUrl();
      const response = await fetch(`${baseUrl}/api/payment/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: 'price_1Riks4Qe524AtcASadiwcLTt',
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/cancel`,
        }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      }
    } catch (error) {
      console.error('Error creating payment session:', error);
    }
  };

  if (!isAuthenticated) {
    return (
      <TrialContainer>
        <TrialTitle>Please log in to use Research Agent</TrialTitle>
        <TrialInfo>
          Sign in to get your daily free trial and access premium features.
        </TrialInfo>
      </TrialContainer>
    );
  }

  if (loading) {
    return (
      <TrialContainer>
        <TrialTitle>Loading usage information...</TrialTitle>
      </TrialContainer>
    );
  }

  if (!usage) {
    return (
      <TrialContainer>
        <TrialTitle>Error loading usage information</TrialTitle>
      </TrialContainer>
    );
  }

  const getTrialStatus = (): 'active' | 'expired' | 'paid' => {
    if (usage.isPaid) return 'paid';
    if (usage.trialUsed) return 'expired';
    return 'active';
  };

  const status = getTrialStatus();

  return (
    <TrialContainer>
      <TrialHeader>
        <TrialTitle>Research Agent Access</TrialTitle>
        <TrialStatus status={status}>
          {status === 'active' && 'Trial Active'}
          {status === 'expired' && 'Trial Expired'}
          {status === 'paid' && 'Premium'}
        </TrialStatus>
      </TrialHeader>

      <UsageStats>
        <UsageStat>
          <UsageNumber>{usage.queriesUsed}</UsageNumber>
          <UsageLabel>Queries Used</UsageLabel>
        </UsageStat>
        <UsageStat>
          <UsageNumber>{usage.maxQueries}</UsageNumber>
          <UsageLabel>Daily Limit</UsageLabel>
        </UsageStat>
      </UsageStats>

      <TrialInfo>
        {status === 'active' && (
          <>
            You have {usage.maxQueries - usage.queriesUsed} free queries remaining today.
            Trial resets daily at midnight UTC.
          </>
        )}
        {status === 'expired' && (
          <>
            Your daily trial has expired. Upgrade to premium for unlimited research queries.
          </>
        )}
        {status === 'paid' && usage.subscriptionExpiry && (
          <>
            Premium subscription active until {new Date(usage.subscriptionExpiry).toLocaleDateString()}.
          </>
        )}
      </TrialInfo>

      {status === 'expired' && (
        <PaymentButton onClick={handlePayment}>
          Upgrade to Premium - £9.99/month
        </PaymentButton>
      )}
    </TrialContainer>
  );
};

export default TrialSystem; 