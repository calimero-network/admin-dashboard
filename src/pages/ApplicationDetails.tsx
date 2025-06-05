import React, { useState, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Package, Release } from './Applications';
import ApplicationDetailsTable from '../components/applications/details/ApplicationDetailsTable';
import apiClient from '../api';
import { ResponseData } from '../api/response';
import { parseAppMetadata } from '../utils/metadata';
import { InstalledApplicationDetails } from '../api/dataSource/NodeDataSource';
import { useServerDown } from '../context/ServerDownContext';
import { AppMetadata } from './InstallApplication';

export interface AppDetails {
  package: Package;
  releases: Release[] | null;
}

export default function ApplicationDetailsPage() {
  const { id } = useParams();
  const { showServerDownPopup } = useServerDown();
  const navigate = useNavigate();
  const [applicationInformation, setApplicationInformation] =
    useState<AppDetails>();

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (id) {
        const fetchApplicationDetailsResponse: ResponseData<InstalledApplicationDetails> =
          await apiClient(showServerDownPopup)
            .node()
            .getInstalledApplicationDetails(id);

        if (fetchApplicationDetailsResponse.error) {
          console.error(fetchApplicationDetailsResponse.error.message);
          return;
        }
        const appMetadata: AppMetadata | null = parseAppMetadata(
          fetchApplicationDetailsResponse.data.application.metadata,
        );

        setApplicationInformation({
          package: {
            id: id,
            name: appMetadata?.applicationName ?? '',
            description: appMetadata?.description ?? '',
            repository: appMetadata?.repositoryUrl ?? '',
            owner: appMetadata?.applicationOwner ?? '',
          },
          releases: null,
        });
      }
    };
    fetchApplicationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        {applicationInformation && (
          <ApplicationDetailsTable
            applicationInformation={applicationInformation}
            navigateToApplicationList={() => navigate('/applications')}
            navigateToAddRelease={() =>
              navigate(`/applications/${id}/add-release`)
            }
          />
        )}
      </PageContentWrapper>
    </FlexLayout>
  );
}
