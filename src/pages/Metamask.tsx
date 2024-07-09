import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MetamaskWrapper } from '@calimero-is-near/calimero-p2p-sdk';
import ContentWrapper from '../components/login/ContentWrapper';
import { getNodeUrl } from '../utils/node';

export default function MetamaskPage() {
  const navigate = useNavigate();
  return (
    <ContentWrapper>
      <MetamaskWrapper
        rpcBaseUrl={getNodeUrl()}
        successRedirect={() => navigate('/identity')}
        navigateBack={() => navigate('/auth')}
        clientLogin={true}
      />
    </ContentWrapper>
  );
}
