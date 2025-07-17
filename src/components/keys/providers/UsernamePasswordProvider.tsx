import React, { useState, useCallback } from 'react';
import { apiClient } from '@calimero-network/calimero-client';
import { styled } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import Button from '../../common/Button';
import Loading from '../../common/Loading';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
`;

const Input = styled.input`
  padding: 0.75rem;
  border: 1px solid #3f3f46;
  border-radius: 0.375rem;
  background-color: #27272a;
  color: white;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  &::placeholder {
    color: #71717a;
  }
`;

const ErrorMessage = styled.div`
  color: #dc2626;
  font-size: 1rem;
  text-align: center;
`;

const SuccessMessage = styled.div`
  color: #16a34a;
  font-size: 1rem;
  text-align: center;
`;

const Title = styled.h2`
  color: white;
  margin: 0;
  text-align: center;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  width: 100%;
`;

interface ProviderConfig {
  network?: string;
  rpcUrl?: string;
  walletConnectProjectId?: string;
}

interface Provider {
  name: string;
  type: string;
  description: string;
  configured: boolean;
  config?: ProviderConfig;
}

interface UsernamePasswordProviderProps {
  provider: Provider;
}

export function UsernamePasswordProvider({
  provider,
}: UsernamePasswordProviderProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const addRootKey = useCallback(async (username: string, password: string) => {
    try {
      const response = await apiClient.admin().addRootKey({
        public_key: username,
        auth_method: 'user_password',
        provider_data: {
          username: username,
          password: password,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setError(null);
      setMessage(response.data?.message || 'Root key added successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add root key');
      throw err;
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!username.trim()) {
        setError('Username is required');
        return;
      }

      if (!password.trim()) {
        setError('Password is required');
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        await addRootKey(username.trim(), password);
      } catch (err) {
        // Error is already handled in addRootKey
      } finally {
        setIsLoading(false);
      }
    },
    [username, password, addRootKey],
  );

  const handleBack = useCallback(() => {
    navigate('/identity');
  }, [navigate]);

  return (
    <Wrapper>
      <Title>Add {provider.name} Root Key</Title>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {message && <SuccessMessage>{message}</SuccessMessage>}

      {!message && (
        <Form onSubmit={handleSubmit}>
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
          />

          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
          />

          <ButtonContainer>
            <Button
              text={isLoading ? 'Adding...' : 'Add Root Key'}
              isDisabled={isLoading}
              onClick={() => handleSubmit}
            />
            <Button text="Cancel" isDisabled={isLoading} onClick={handleBack} />
          </ButtonContainer>
        </Form>
      )}

      {isLoading && <Loading />}

      {message && <Button onClick={handleBack} text="Back to Identity" />}
    </Wrapper>
  );
}
