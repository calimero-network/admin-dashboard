import React, { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";
import { FlexLayout } from "../components/layout/FlexLayout";
import PageContentWrapper from "../components/common/PageContentWrapper";
import ContextTable from "../components/context/contextDetails/ContextTable";
import { useParams } from "react-router-dom";
import apiClient from "../api/index";
import { DetailsOptions } from "../constants/ContextConstants";
import { useNavigate } from "react-router-dom";
import { useRPC } from "../hooks/useNear";
import { TableOptions } from "../components/common/OptionsHeader";
import { ClientKey, ContextData } from "../api/dataSource/NodeDataSource";

const initialOptions = [
  {
    name: "Details",
    id: DetailsOptions.DETAILS,
    count: -1,
  },
  {
    name: "Client Keys",
    id: DetailsOptions.CLIENT_KEYS,
    count: 0,
  },
  {
    name: "Users",
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
  clientKeys: ClientKey[];
  users: string[];
  contextId: string;
}

export default function ContextDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [nodeContextDetails, setNodeContextDetails] = useState<ContextObject>();
  const [currentOption, setCurrentOption] = useState<string>(
    DetailsOptions.DETAILS
  );
  const [tableOptions, setTableOptions] =
    useState<TableOptions[]>(initialOptions);
  const { getPackage, getLatestRelease } = useRPC();

  const generateContextObjects = async (nodeContext: ContextData) => {
    const packageData = await getPackage(nodeContext.context.applicationId);
    const versionData = await getLatestRelease(nodeContext.context.applicationId);
    return {
      ...packageData,
      ...versionData,
      contextId: id,
      clientKeys: nodeContext.clientKeys,
      users: nodeContext.users,
      applicationId: nodeContext.context.applicationId,
    } as ContextObject;
  };

  useEffect(() => {
    const fetchNodeContexts = async () => {
      if (id) {
        const nodeContext = await apiClient.node().getContext(id);
        if (nodeContext) {
          const contextObject = await generateContextObjects(nodeContext);
          setNodeContextDetails(contextObject);
          //TBD - after client keys and users are implemented
          setTableOptions([
            {
              name: "Details",
              id: DetailsOptions.DETAILS,
              count: -1,
            },
            {
              name: "Client Keys",
              id: DetailsOptions.CLIENT_KEYS,
              count: nodeContext.clientKeys.length,
            },
            {
              name: "Users",
              id: DetailsOptions.USERS,
              count: nodeContext.users.length,
            },
          ]);
        }
      }
    };
    fetchNodeContexts();
  }, []);
  // TODO - handler for failed to fetch context details
  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        {nodeContextDetails && <ContextTable
          nodeContextDetails={nodeContextDetails}
          navigateToContextList={() => navigate("/contexts")}
          currentOption={currentOption}
          setCurrentOption={setCurrentOption}
          tableOptions={tableOptions}
        />}
      </PageContentWrapper>
    </FlexLayout>
  );
}
