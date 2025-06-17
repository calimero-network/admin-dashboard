import { useEffect, useState } from 'react';
import React from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import { useNavigate } from 'react-router-dom';
import PageContentWrapper from '../components/common/PageContentWrapper';
import ApplicationsTable from '../components/applications/ApplicationsTable';
import { TableOptions } from '../components/common/OptionsHeader';
import { ApplicationOptions } from '../constants/ContextConstants';
import { parseAppMetadata } from '../utils/metadata';
import { ModalContent } from '../components/common/StatusModal';
import { AppMetadata } from './InstallApplication';
import { apiClient } from '@calimero-network/calimero-client';
import { InstalledApplication } from '@calimero-network/calimero-client/lib/api/nodeApi';

export enum Tabs {
  AVAILABLE,
  OWNED,
  INSTALLED,
}

export interface Application {
  id: string;
  blob: string;
  version: string | null;
  source: string;
  contract_app_id: string | null;
  name: string | null;
  description: string | null;
  repository: string | null;
  owner: string | null;
}

export interface Package {
  id: string;
  name: string;
  description: string;
  repository: string;
  owner: string;
  version: string;
}

export interface Release {
  version: string;
  notes: string;
  path: string;
  hash: string;
}

const initialOptions = [
  {
    name: 'Installed',
    id: ApplicationOptions.INSTALLED,
    count: 0,
  },
];

export interface Applications {
  available: Application[];
  owned: Application[];
  installed: Application[];
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');
  const [currentOption, setCurrentOption] = useState<string>(
    ApplicationOptions.INSTALLED,
  );
  const [tableOptions] = useState<TableOptions[]>(initialOptions);
  const [applications, setApplications] = useState<Applications>({
    available: [],
    owned: [],
    installed: [],
  });
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [uninstallStatus, setUninstallStatus] = useState<ModalContent>({
    title: '',
    message: '',
    error: false,
  });

  const setApps = async () => {
    setErrorMessage('');
    const fetchApplicationResponse = await apiClient.node().getInstalledApplications();

    console.log('fetchApplicationResponse', fetchApplicationResponse);

    if (fetchApplicationResponse.error) {
      setErrorMessage(fetchApplicationResponse.error.message);
      return;
    }
    let installedApplications = fetchApplicationResponse.data?.apps;
    if (installedApplications.length !== 0) {
      var tempApplications: (Application | null)[] = await Promise.all(
        installedApplications.map(
          async (app: InstalledApplication): Promise<Application | null> => {
            var appMetadata: AppMetadata | null = parseAppMetadata(
              app.metadata,
            );

            let application: Application = {
              id: app.id,
              version: appMetadata ? appMetadata.applicationVersion : null,
              source: app.source,
              blob: app.blob,
              contract_app_id: null,
              name: appMetadata ? appMetadata.applicationName : null,
              description: appMetadata ? appMetadata.description : null,
              repository: appMetadata ? appMetadata.repositoryUrl : null,
              owner: appMetadata ? appMetadata.applicationOwner : null,
            };
           
            console.log('application', application);
            return application;
          },
        ),
      );
      var installed: Application[] = tempApplications.filter(
        (app): app is Application => app !== null,
      );

      setApplications((prevState: Applications) => ({
        ...prevState,
        installed,
      }));
    }
  };

  useEffect(() => {
    setApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uninstallApplication = async () => {
    const contextResponse = await apiClient.node().getContexts();
    if (contextResponse.error) {
      setUninstallStatus({
        title: 'Error',
        message: contextResponse.error.message,
        error: true,
      });
      setShowActionDialog(false);
      setShowStatusModal(true);
      return;
    }

    const contextList = contextResponse.data?.contexts;

    if (contextList && contextList.length !== 0) {
      const contextList = contextResponse.data?.contexts;
      const usedByContextsIds =
        contextList
          ?.filter((context) => context.applicationId === selectedAppId)
          .map((context) => context.id) ?? [];

      if (usedByContextsIds.length !== 0) {
        setUninstallStatus({
          title: 'This application cannot be uninstalled',
          message: `This application is used by the following contexts: ${usedByContextsIds.join(', ')}`,
          error: true,
        });
        setShowActionDialog(false);
        setShowStatusModal(true);
        return;
      }
    }

    const response = await apiClient.node().uninstallApplication(selectedAppId);
    if (response.error) {
      setUninstallStatus({
        title: 'Error',
        message: response.error.message,
        error: true,
      });
    } else {
      await setApps();
      setUninstallStatus({
        title: 'Success',
        message: 'Application uninstalled successfully',
        error: false,
      });
    }
    setShowActionDialog(false);
    setShowStatusModal(true);
  };

  const showModal = (id: string) => {
    setSelectedAppId(id);
    setShowActionDialog(true);
  };

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <ApplicationsTable
          applicationsList={applications}
          currentOption={currentOption}
          setCurrentOption={setCurrentOption}
          tableOptions={tableOptions}
          navigateToAppDetails={(app: Application | undefined) => {
            if (app) {
              navigate(`/applications/${app.id}`);
            }
          }}
          navigateToPublishApp={() => navigate('/publish-application')}
          navigateToInstallApp={() => navigate('/applications/install')}
          uninstallApplication={uninstallApplication}
          showStatusModal={showStatusModal}
          closeModal={() => setShowStatusModal(false)}
          uninstallStatus={uninstallStatus}
          showActionDialog={showActionDialog}
          setShowActionDialog={setShowActionDialog}
          showModal={showModal}
          errorMessage={errorMessage}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
