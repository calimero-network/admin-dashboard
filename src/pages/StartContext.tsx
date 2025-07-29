import React, { useEffect, useState } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import { useNavigate } from 'react-router-dom';
import { ContentCard } from '../components/common/ContentCard';
import StartContextCard from '../components/context/startContext/StartContextCard';
import translations from '../constants/en.global.json';
import { apiClient } from '@calimero-network/calimero-client';
import { InstalledApplication } from '@calimero-network/calimero-client/lib/api/nodeApi';

export interface ContextApplication {
  appId: string;
  name: string;
  version: string;
  path: string;
  hash: string;
}

export default function StartContextPage() {
  const t = translations.startContextPage;
  const navigate = useNavigate();
  const [applicationId, setApplicationId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [startContextStatus, setStartContextStatus] = useState({
    title: '',
    message: '',
    error: false,
  });
  const [applications, setApplications] = useState<InstalledApplication[]>([]);

  const startContext = async (initArgs: string) => {
    setIsLoading(true);

    const startContextResponse = await apiClient
      .node()
      .createContext(applicationId, initArgs, protocol);
    if (startContextResponse.error) {
      setStartContextStatus({
        title: t.startContextErrorTitle,
        message: t.startContextErrorMessage,
        error: true,
      });
    } else {
      const newConextId = startContextResponse.data?.contextId;
      const identityPublicKey = startContextResponse.data?.memberPublicKey;
      setStartContextStatus({
        title: t.startContextSuccessTitle,
        message: t.startedContextMessage
          .replace('{0}', newConextId)
          .replace('{1}', identityPublicKey),
        error: false,
      });
    }
    setIsLoading(false);
    setShowStatusModal(true);
  };

  const closeModal = () => {
    setShowStatusModal(false);
    if (startContextStatus.error) {
      setStartContextStatus({
        title: '',
        message: '',
        error: false,
      });
      return;
    }
    navigate('/contexts');
  };

  useEffect(() => {
    const fetchApplication = async () => {
      const fetchApplicationResponse = await apiClient
        .node()
        .getInstalledApplications();
      setApplications(fetchApplicationResponse.data?.apps ?? []);
    };
    fetchApplication();
  }, []);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <ContentCard
          headerBackText={t.backButtonText}
          headerOnBackClick={() => navigate('/contexts')}
        >
          <StartContextCard
            applicationId={applicationId}
            setApplicationId={setApplicationId}
            setProtocol={setProtocol}
            startContext={startContext}
            isLoading={isLoading}
            showStatusModal={showStatusModal}
            closeModal={closeModal}
            startContextStatus={startContextStatus}
            applications={applications}
          />
        </ContentCard>
      </PageContentWrapper>
    </FlexLayout>
  );
}
