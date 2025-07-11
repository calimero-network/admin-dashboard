import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import ContextTable from '../components/context/contextDetails/ContextTable';
import { useParams, useNavigate } from 'react-router-dom';
import { DetailsOptions } from '../constants/ContextConstants';
import { TableOptions } from '../components/common/OptionsHeader';
import { ContextDetails } from '../types/context';
import { parseAppMetadata } from '../utils/metadata';
import { AppMetadata } from './InstallApplication';
import {
  Context,
  ContextStorage,
} from '@calimero-network/calimero-client/lib/api/nodeApi';
import { apiClient } from '@calimero-network/calimero-client';

const initialOptions = [
  {
    name: 'Details',
    id: DetailsOptions.DETAILS,
    count: -1,
  } as TableOptions,
  {
    name: 'Client Keys',
    id: DetailsOptions.CLIENT_KEYS,
    count: 0,
  } as TableOptions,
  {
    name: 'Users',
    id: DetailsOptions.USERS,
    count: 0,
  } as TableOptions,
];

export default function ContextDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contextDetails, setContextDetails] = useState<ContextDetails>();
  const [contextDetailsError, setContextDetailsError] = useState<string | null>(
    null,
  );
  const [contextUsers, setContextUsers] = useState<{ identity: string }[]>();
  const [contextUsersError, setContextUsersError] = useState<string | null>(
    null,
  );
  const [contextStorage, setContextStorage] = useState<ContextStorage>();
  const [contextStorageError, setContextStorageError] = useState<string | null>(
    null,
  );
  const [currentOption, setCurrentOption] = useState<string>(
    DetailsOptions.DETAILS,
  );
  const [tableOptions, setTableOptions] =
    useState<TableOptions[]>(initialOptions);

  const generateContextObjects = useCallback(
    async (context: Context, id: string, metadata?: number[]) => {
      let appId = context.applicationId;
      const appMetadata: AppMetadata | null = parseAppMetadata(metadata ?? []);

      const contextDetails: ContextDetails = {
        applicationId: appId,
        contextId: id,
        package: {
          id: appId,
          name: appMetadata?.applicationName ?? '',
          description: appMetadata?.description ?? '',
          repository: appMetadata?.repositoryUrl ?? '',
          owner: appMetadata?.applicationOwner ?? '',
          version: appMetadata?.applicationVersion ?? '',
        },
        release: {
          version: appMetadata?.applicationVersion ?? '',
          notes: '',
          path: '',
          hash: '',
        },
      };

      return contextDetails;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  useEffect(() => {
    const fetchNodeContexts = async () => {
      if (id) {
        const [nodeContext, contextClientUsers, contextStorage] =
          await Promise.all([
            apiClient.node().getContext(id),
            apiClient.node().getContextUsers(id),
            apiClient.node().getContextStorageUsage(id),
          ]);

        if (nodeContext.data) {
          const applicationMetadata = (
            await apiClient
              .node()
              .getInstalledApplicationDetails(nodeContext.data.applicationId)
          ).data?.metadata;
          const contextObject = await generateContextObjects(
            nodeContext.data,
            id,
            applicationMetadata,
          );
          setContextDetails(contextObject);
        } else {
          setContextDetailsError(nodeContext.error?.message);
        }

        if (contextClientUsers.data) {
          setContextUsers(
            contextClientUsers.data.identities.map((identity) => ({
              identity: identity,
            })),
          );
        } else {
          setContextUsersError(contextClientUsers.error?.message);
        }

        if (contextStorage.data) {
          setContextStorage(contextStorage.data);
        } else {
          setContextStorageError(contextStorage.error?.message);
        }

        setTableOptions([
          {
            name: 'Details',
            id: DetailsOptions.DETAILS,
            count: -1,
          },
          {
            name: 'Users',
            id: DetailsOptions.USERS,
            count: contextClientUsers.data?.identities?.length ?? 0,
          },
        ]);
      }
    };
    fetchNodeContexts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateContextObjects, id]);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        {contextDetails && contextUsers && contextStorage && (
          <ContextTable
            contextDetails={contextDetails}
            contextDetailsError={contextDetailsError}
            contextUsers={contextUsers}
            contextUsersError={contextUsersError}
            contextStorage={contextStorage}
            contextStorageError={contextStorageError}
            navigateToContextList={() => navigate('/contexts')}
            currentOption={currentOption}
            setCurrentOption={setCurrentOption}
            tableOptions={tableOptions}
          />
        )}
      </PageContentWrapper>
    </FlexLayout>
  );
}
