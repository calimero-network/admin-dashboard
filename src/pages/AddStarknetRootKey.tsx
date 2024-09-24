import React from 'react';
import { useNavigate } from 'react-router-dom';
import ContentWrapper from '../components/login/ContentWrapper';
import { getNodeUrl } from '../utils/node';
import { StarknetRootKey } from '@calimero-is-near/calimero-p2p-sdk';

export default function AddStarknetRootKey() {
  const navigate = useNavigate();
  return (
    <ContentWrapper>
      <StarknetRootKey
        applicationId={'admin-ui'}
        rpcBaseUrl={getNodeUrl()}
        successRedirect={() => navigate('/identity')}
        navigateBack={() => navigate('/identity/root-key')}
      />
    </ContentWrapper>
  );
}
