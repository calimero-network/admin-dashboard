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
import {
  Application,
  GetInstalledApplicationsResponse,
} from '../api/dataSource/NodeDataSource';
import { ResponseData } from '../api/response';

export enum Tabs {
  AVAILABLE,
  OWNED,
  INSTALLED,
}

function mapStringToTab(tabName: string): Tabs {
  switch (tabName.toUpperCase()) {
    case 'AVAILABLE':
      return Tabs.AVAILABLE;
    case 'OWNED':
      return Tabs.OWNED;
    case 'INSTALLED':
      return Tabs.INSTALLED;
    default:
      return Tabs.AVAILABLE;
  }
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
  const { getPackages, getLatestRelease, getPackage } = useRPC();
  const [_selectedTab, setSelectedTab] = useState(Tabs.AVAILABLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentOption, setCurrentOption] = useState<string>(
    ApplicationOptions.AVAILABLE,
  );
  const [tableOptions] = useState<TableOptions[]>(initialOptions);
  const [applications, setApplications] = useState<Applications>({
    available: [],
    owned: [],
    installed: [],
  });

  useEffect(() => {
    const setApplicationsList = async () => {
      const packages = await getPackages();
      if (packages.length !== 0) {
        var tempApplications: Application[] = await Promise.all(
          packages.map(async (appPackage: Package) => {
            const releaseData = await getLatestRelease(appPackage.id);

            const application: Application = {
              id: appPackage.id,
              name: appPackage.name,
              description: appPackage.description,
              repository: appPackage.repository,
              owner: appPackage.owner,
              version: releaseData?.version ?? '',
              blob: '',
              source: '',
              contract_app_id: appPackage.id,
            };
            return application;
          }),
        );

        //remove all apps without release
        tempApplications = tempApplications.filter((app) => app.version !== '');

        setApplications((prevState: Applications) => ({
          ...prevState,
          available: tempApplications,
        }));
      }
    };
    setApplicationsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const setApps = async () => {
      setErrorMessage('');
      const fetchApplicationResponse: ResponseData<GetInstalledApplicationsResponse> =
        await apiClient.node().getInstalledApplications();

      if (fetchApplicationResponse.error) {
        setErrorMessage(fetchApplicationResponse.error.message);
        return;
      }
      let installedApplications = fetchApplicationResponse.data?.apps;
      if (installedApplications.length !== 0) {
        var tempApplications: Application[] = await Promise.all(
          installedApplications.map(
            async (app: Application): Promise<Application> => {
              const packageData: Package | null = await getPackage(app.id);

              let application: Application | null = null;
              if (!packageData) {
                application = {
                  ...app,
                  name: 'local app',
                  description: null,
                  repository: null,
                  owner: null,
                };
              } else {
                application = {
                  ...app,
                  name: packageData?.name ?? '',
                  description: packageData?.description,
                  repository: packageData?.repository,
                  owner: packageData?.owner,
                };
              }
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

    setApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            if (app && app.version) {
              navigate(`/applications/${app.id}`);
            }
          }}
          navigateToPublishApp={() => navigate('/publish-application')}
          changeSelectedTab={(option: string) =>
            setSelectedTab(mapStringToTab(option))
          }
          errorMessage={errorMessage}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
