import React, { useState } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import { useNavigate } from 'react-router-dom';
import { ContentCard } from '../components/common/ContentCard';
import translations from '../constants/en.global.json';
import apiClient from '../api/index';
import InstallApplicationCard from '../components/applications/InstallApplicationCard';
import { useServerDown } from '../context/ServerDownContext';

export interface Application {
  appId: string;
  name: string;
  version: string;
  path: string;
  hash: string;
}

export interface AppMetadata {
  applicationUrl: string;
  applicationName: string;
  applicationOwner: string;
  applicationVersion: string;
  description: string;
  repositoryUrl: string;
}

export default function InstallApplication() {
  const t = translations.applicationsPage.installApplication;
  const navigate = useNavigate();
  const { showServerDownPopup } = useServerDown();
  const [isLoading, setIsLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [installAppStatus, setInstallAppStatus] = useState({
    title: '',
    message: '',
    error: false,
  });
  const [application, setApplication] = useState<AppMetadata>({
    applicationUrl: '',
    applicationName: '',
    applicationOwner: '',
    applicationVersion: '',
    description: '',
    repositoryUrl: '',
  });

  const installApplication = async () => {
    setIsLoading(true);
    const appId: string | null = await installApplicationHandler();
    if (!appId) {
      setIsLoading(false);
      setShowStatusModal(true);
      return;
    }
    setIsLoading(false);
    setShowStatusModal(true);
  };

  const installApplicationHandler = async (): Promise<string | null> => {
    const response = await apiClient(showServerDownPopup)
      .node()
      .installApplication(application);
    if (response.error) {
      setInstallAppStatus({
        title: t.failInstallTitle,
        message: response.error.message,
        error: true,
      });
      return null;
    } else {
      setInstallAppStatus({
        title: t.successInstallTitle,
        message: `Installed application ${application.applicationName}, with ID ${response.data.applicationId}.`,
        error: false,
      });
      return response.data.applicationId;
    }
  };

  const closeModal = () => {
    setShowStatusModal(false);
    if (installAppStatus.error) {
      setInstallAppStatus({
        title: '',
        message: '',
        error: false,
      });
      return;
    }
    navigate('/applications');
  };

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <ContentCard
          headerBackText={t.backButtonText}
          headerOnBackClick={() => navigate('/applications')}
        >
          <InstallApplicationCard
            application={application}
            setApplication={setApplication}
            installApplication={installApplication}
            isLoading={isLoading}
            showStatusModal={showStatusModal}
            closeModal={closeModal}
            installAppStatus={installAppStatus}
          />
        </ContentCard>
      </PageContentWrapper>
    </FlexLayout>
  );
}
