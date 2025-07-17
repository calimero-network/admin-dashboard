import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '@calimero-network/calimero-client';
import ContentWrapper from '../layout/ContentWrapper';
import { styled } from 'styled-components';
import { NearWalletProvider } from './providers/NearWalletProvider';
import { UsernamePasswordProvider } from './providers/UsernamePasswordProvider';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #1c1c1c;
  gap: 1rem;
  border-radius: 0.5rem;
  width: fit-content;
  padding: 2rem;
`;

const ErrorWrapper = styled(Wrapper)`
  color: #dc2626;
  font-size: 1.1rem;
`;

const LoadingWrapper = styled(Wrapper)`
  color: white;
  font-size: 1.1rem;
`;

interface Provider {
  name: string;
  type: string;
  description: string;
  configured: boolean;
  config?: {
    network?: string;
    rpcUrl?: string;
    walletConnectProjectId?: string;
  };
}

export default function RootKeyProvidersWrapper() {
  const { providerId } = useParams();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const response = await apiClient.auth().getProviders();
        if (response.error) {
          setError(response.error.message);
          return;
        }

        const foundProvider = response.data?.providers.find(
          (p) => p.name.toLowerCase() === providerId?.toLowerCase(),
        );

        if (!foundProvider) {
          setError('Provider not found');
          return;
        }

        setProvider(foundProvider);
      } catch (err) {
        setError('Failed to fetch provider');
      } finally {
        setLoading(false);
      }
    };

    fetchProvider();
  }, [providerId]);

  if (loading) {
    return (
      <ContentWrapper>
        <LoadingWrapper>
          <div>Loading provider...</div>
        </LoadingWrapper>
      </ContentWrapper>
    );
  }

  if (error) {
    return (
      <ContentWrapper>
        <ErrorWrapper>
          <div>Error: {error}</div>
        </ErrorWrapper>
      </ContentWrapper>
    );
  }

  if (!provider) {
    return (
      <ContentWrapper>
        <ErrorWrapper>
          <div>Provider not found</div>
        </ErrorWrapper>
      </ContentWrapper>
    );
  }

  const renderProvider = () => {
    switch (provider.name.toLowerCase()) {
      case 'near_wallet':
        return <NearWalletProvider provider={provider} />;
      case 'user_password':
        return <UsernamePasswordProvider provider={provider} />;
      default:
        return (
          <div style={{ color: 'white', textAlign: 'center' }}>
            Provider "{provider.name}" is not yet supported in the admin
            dashboard.
            <br />
            <br />
            Supported providers: near_wallet, username_password
          </div>
        );
    }
  };

  return (
    <ContentWrapper>
      <Wrapper>{renderProvider()}</Wrapper>
    </ContentWrapper>
  );
}
