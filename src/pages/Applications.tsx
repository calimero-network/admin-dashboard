import { useEffect, useState } from 'react';
import React from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import { useRPC } from '../hooks/useNear';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/index';
import PageContentWrapper from '../components/common/PageContentWrapper';
import ApplicationsTable from '../components/applications/ApplicationsTable';
import { TableOptions } from '../components/common/OptionsHeader';
import { ApplicationOptions } from '../constants/ContextConstants';
import { BlobApplication, ListBlobApplicationResponse } from '../api/dataSource/NodeDataSource';
import { ResponseData } from '../api/response';

export enum Tabs {
  INSTALL_APPLICATION,
  APPLICATION_LIST,
}

export interface Package {
  id: string;
  name: string;
  description: string;
  repository: string;
  owner: string;
}

export interface Release {
  version: string;
  notes: string;
  path: string;
  hash: string;
}

export interface InstalledApplication {
  id: string;
  version: string;
}

export interface Application extends Package {
  version: string;
  contract_app_id: string;
}

const initialOptions = [
  {
    name: 'Available',
    id: ApplicationOptions.AVAILABLE,
    count: 0,
  },
  {
    name: 'Owned',
    id: ApplicationOptions.OWNED,
    count: 0,
  },
];

export interface Applications {
  available: Application[];
  owned: Application[];
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { getPackages, getPackage } = useRPC();
  const [selectedTab, setSelectedTab] = useState(Tabs.APPLICATION_LIST);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentOption, setCurrentOption] = useState<string>(
    ApplicationOptions.AVAILABLE,
  );
  const [tableOptions] = useState<TableOptions[]>(initialOptions);
  const [packages, setPackages] = useState<Package[]>([]);
  const [applications, setApplications] = useState<Applications>({
    available: [],
    owned: [],
  });

  useEffect(() => {
    if (!packages.length) {
      (async () => {
        setPackages(await getPackages());
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const setApps = async () => {
      setErrorMessage('');
      const fetchApplicationResponse: ResponseData<ListBlobApplicationResponse> =
        await apiClient.node().getInstalledApplications();

      if (fetchApplicationResponse.error) {
        setErrorMessage(fetchApplicationResponse.error.message);
        return;
      }

      let installedApplications = fetchApplicationResponse.data?.apps;
      if (installedApplications.length !== 0) {
        var tempApplications: (Application | null)[] = await Promise.all(
          installedApplications.map(
            async (app: BlobApplication): Promise<Application | null> => {
              const packageData: Package | null = await getPackage(app.contract_app_id);
              if (!packageData) {
                return null;
              }

              const application: Application = {
                contract_app_id: app.contract_app_id,
                version: app.version,
                id: app.id,
                name: packageData?.name ?? '',
                description: packageData?.description,
                repository: packageData?.repository,
                owner: packageData?.owner,
              };
              return application;
            },
          ),
        );
        var available: Application[] = tempApplications.filter(
          (app): app is Application => app !== null,
        );

        setApplications((prevState: Applications) => ({
          ...prevState,
          available: available,
        }));
      }
    };

    setApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab]);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <ApplicationsTable
          applicationsList={applications}
          currentOption={currentOption}
          setCurrentOption={setCurrentOption}
          tableOptions={tableOptions}
          navigateToAppDetails={(id: string) => navigate(`/applications/${id}`)}
          navigateToPublishApp={() => navigate('/publish-application')}
          changeSelectedTab={() => setSelectedTab(Tabs.INSTALL_APPLICATION)}
          errorMessage={errorMessage}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
