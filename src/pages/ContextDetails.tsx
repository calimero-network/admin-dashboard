import React, { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";
import { FlexLayout } from "../components/layout/FlexLayout";
import PageContentWrapper from "../components/common/PageContentWrapper";
import ContextTable from "../components/context/contextDetails/ContextTable";
import { useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/index";
import { DetailsOptions } from "../constants/ContextConstants";
import { useRPC } from "../hooks/useNear";
import { TableOptions } from "../components/common/OptionsHeader";
import { ClientKey, Context, User } from "../api/dataSource/NodeDataSource";

const initialOptions = [
  {
    name: 'Details',
    id: DetailsOptions.DETAILS,
    count: -1,
  },
  {
    name: 'Client Keys',
    id: DetailsOptions.CLIENT_KEYS,
    count: 0,
  },
  {
    name: 'Users',
    id: DetailsOptions.USERS,
    count: 0,
  },
];

export interface ContextObject {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  repository: string;
  path: string;
  version: string;
  owner: string;
  contextId: string;
  sizeInBytes: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export default function ContextDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contextDetails, setContextDetails] =
    useState<ApiResponse<ContextObject>>();
  const [contextClientKeys, setContextClientKeys] =
    useState<ApiResponse<ClientKey[]>>();
  const [contextUsers, setContextUsers] = useState<ApiResponse<User[]>>();
  const [currentOption, setCurrentOption] = useState<string>(
    DetailsOptions.DETAILS,
  );
  const [tableOptions, setTableOptions] =
    useState<TableOptions[]>(initialOptions);
  const { getPackage, getLatestRelease } = useRPC();

  const generateContextObjects = async (context: Context) => {
    const packageData = await getPackage(context.applicationId);
    const versionData = await getLatestRelease(context.applicationId);
    const storageInfo = await apiClient.node().getContextStorageUsage(context.id);

    return {
      ...packageData,
      ...versionData,
      contextId: id,
      applicationId: context.applicationId,
      sizeInBytes: storageInfo.sizeInBytes,
    } as ContextObject;
  };

  useEffect(() => {
    const fetchNodeContexts = async () => {
      if (id) {
        const [nodeContext, contextClientKeys, contextClientUsers] =
          await Promise.all([
            apiClient.node().getContext(id),
            apiClient.node().getContextClientKeys(id),
            apiClient.node().getContextUsers(id),
          ]);

        if (nodeContext.data) {
          const contextObject = await generateContextObjects(nodeContext.data);
          setContextDetails({ data: contextObject });
        } else {
          setContextDetails({ error: nodeContext.error?.message });
        }

        if (contextClientKeys.data) {
          setContextClientKeys({ data: contextClientKeys.data });
        } else {
          setContextClientKeys({ error: contextClientKeys.error?.message });
        }

        if (contextClientUsers.data) {
          setContextUsers({ data: contextClientUsers.data });
        } else {
          setContextUsers({ error: contextClientUsers.error?.message });
        }

        setTableOptions([
          {
            name: "Details",
            id: DetailsOptions.DETAILS,
            count: -1,
          },
          {
            name: "Client Keys",
            id: DetailsOptions.CLIENT_KEYS,
            count: contextClientKeys.data?.length ?? 0,
          },
          {
            name: "Users",
            id: DetailsOptions.USERS,
            count: contextClientUsers.data?.length ?? 0,
          },
        ]);
      }
    };
    fetchNodeContexts();
  }, []);
  // TODO - handler for failed to fetch context details
  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        {contextDetails && contextClientKeys && contextUsers && (
          <ContextTable
            contextDetails={contextDetails}
            contextClientKeys={contextClientKeys}
            contextUsers={contextUsers}
            navigateToContextList={() => navigate("/contexts")}
            currentOption={currentOption}
            setCurrentOption={setCurrentOption}
            tableOptions={tableOptions}
          />
        )}
      </PageContentWrapper>
    </FlexLayout>
  );
}
