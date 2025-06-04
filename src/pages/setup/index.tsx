import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearStorage, setAppEndpointKey } from '../../utils/storage';
import ContentWrapper from '../../components/login/ContentWrapper';
import { SetupModal } from '../../components/setup/SetupModal';
import { getNodeUrl } from '../../utils/node';

export default function SetupPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    clearStorage();
    const params = new URLSearchParams(location.search);
    const nodeUrl = params.get('node-url');
    if (nodeUrl) {
      setAppEndpointKey(nodeUrl);
    }
  }, [location.search]);

  return (
    <ContentWrapper>
      <SetupModal
        successRoute={() => navigate('/auth')}
        setNodeUrl={setAppEndpointKey}
        getNodeUrl={getNodeUrl}
      />
    </ContentWrapper>
  );
}
