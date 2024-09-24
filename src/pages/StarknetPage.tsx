import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginWithStarknet } from '@calimero-is-near/calimero-p2p-sdk';
import ContentWrapper from '../components/login/ContentWrapper';
import { getNodeUrl } from '../utils/node';

export default function StarknetPage() {
  const navigate = useNavigate();
  return (
    <ContentWrapper>
      <LoginWithStarknet
        rpcBaseUrl={getNodeUrl()}
        successRedirect={() => navigate('/identity')}
        navigateBack={() => navigate('/auth')}
      />
    </ContentWrapper>
  );
}
