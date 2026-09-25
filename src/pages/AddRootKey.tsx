import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ContentWrapper from '../components/layout/ContentWrapper';
import { apiClient } from '@calimero-network/calimero-client';
import { styled } from 'styled-components';
import translations from '../constants/en.global.json';
import Button from '../components/common/Button';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  gap: 1rem;
  border-radius: 0;
  width: fit-content;

  .container {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .center-container {
    width: 100%;
    text-align: center;
    color: var(--text-primary);
    margin-top: 0.375rem;
    margin-bottom: 0.375rem;
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: medium;
  }

  .flex-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 0.5rem;
    padding-top: 3.125rem;
  }

  .login-btn {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.125rem;
    height: 2.875rem;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1.5rem;
    font-weight: 500;
    line-height: 1.25rem;
    border-radius: 0;
    color: var(--text-primary);
    border: none;
    outline: none;
    background-color: var(--bg-tertiary);
    transition: background-color 0.2s;
    margin-bottom: 1rem;

    &:hover {
      background-color: var(--border-color);
    }

    &.metamask-btn {
      background-color: #ff7a00;
      &:hover {
        background-color: #ff8a20;
      }
    }

    img {
      margin-right: 0.5rem;
    }
  }
`;

const LoadingWrapper = styled(Wrapper)`
  .container {
    color: var(--text-primary);
    font-size: 1.1rem;
  }
`;

const ErrorWrapper = styled(Wrapper)`
  .container {
    color: var(--error);
    font-size: 1.1rem;
  }
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

export default function AddRootKeyPage() {
  const navigate = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = translations.loginPage.loginSelector;

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await apiClient.auth().getProviders();
        if (response.error) {
          setError(response.error.message);
        } else if (response.data) {
          setProviders(response.data.providers);
        }
      } catch (err) {
        setError('Failed to fetch providers');
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, []);

  const handleProviderClick = async (provider: Provider) => {
    navigate(`/identity/root-key/${provider.name.toLowerCase()}`);
  };

  if (loading) {
    return (
      <ContentWrapper>
        <LoadingWrapper>
          <div className="container">Loading providers...</div>
        </LoadingWrapper>
      </ContentWrapper>
    );
  }

  if (error) {
    return (
      <ContentWrapper>
        <ErrorWrapper>
          <div className="container">Error: {error}</div>
        </ErrorWrapper>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <Wrapper>
        <div className="container">
          <div className="center-container">{t.title}</div>
          <div className="flex-container">
            {providers.map((provider, index) => (
              <button
                key={index}
                className={`login-btn ${provider.type.toLowerCase() === 'metamask' ? 'metamask-btn' : ''}`}
                onClick={() => handleProviderClick(provider)}
              >
                {provider.name}
              </button>
            ))}
          </div>
          <Button onClick={() => navigate('/identity')} text="Back" />
        </div>
      </Wrapper>
    </ContentWrapper>
  );
}
