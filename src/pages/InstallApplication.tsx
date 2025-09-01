import React, { useState } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import { useNavigate } from 'react-router-dom';
import { ContentCard } from '../components/common/ContentCard';
import translations from '../constants/en.global.json';
import InstallApplicationCard from '../components/applications/InstallApplicationCard';
import { apiClient } from '@calimero-network/calimero-client';
import { createAppMetadata } from '../utils/metadata';

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
  contractAppId: string;
  repositoryUrl: string;
}

export default function InstallApplication() {
  const t = translations.applicationsPage.installApplication;
  const navigate = useNavigate();
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
    contractAppId: '',
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
    const appMetadata: AppMetadata = {
      applicationUrl: application.applicationUrl,
      applicationName: application.applicationName,
      applicationOwner: application.applicationOwner,
      applicationVersion: application.applicationVersion,
      description: application.description,
      contractAppId: application.contractAppId,
      repositoryUrl: application.repositoryUrl,
    };
    const response = await apiClient
      .node()
      .installApplication(
        application.applicationUrl,
        createAppMetadata(appMetadata),
      );
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
    setInstallAppStatus({
      title: '',
      message: '',
      error: false,
    });

    if (!installAppStatus.error) {
      navigate('/applications');
    }
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
            setInstallAppStatus={setInstallAppStatus}
            setShowStatusModal={setShowStatusModal}
          />
        </ContentCard>
      </PageContentWrapper>
    </FlexLayout>
  );
}
