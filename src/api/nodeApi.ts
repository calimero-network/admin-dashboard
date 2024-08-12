import { ApiResponse } from '@calimero-is-near/calimero-p2p-sdk';
import {
  ContextStorage,
  Context,
  HealthRequest,
  HealthStatus,
  ContextClientKeysList,
  ContextUsersList,
  ListApplicationsResponse,
  ApiContext,
  ContextList,
  DidResponse,
  DeleteContextResponse,
  JoinContextResponse,
  NearRequest,
  LoginResponse,
  NodeChallenge,
  RootKeyResponse,
} from './dataSource/NodeDataSource';

export interface NodeApi {
  getInstalledApplications(): ApiResponse<ListApplicationsResponse>;
  getContexts(): ApiResponse<ContextList>;
  getContext(contextId: string): ApiResponse<ApiContext>;
  getContextClientKeys(contextId: string): ApiResponse<ContextClientKeysList>;
  getContextUsers(contextId: string): ApiResponse<ContextUsersList>;
  deleteContext(contextId: string): ApiResponse<DeleteContextResponse>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): ApiResponse<Context>;
  getDidList(): ApiResponse<DidResponse>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
  getContextStorageUsage(contextId: string): ApiResponse<ContextStorage>;
  installApplication(
    selectedPackage: string,
    selectedVersion: string,
    ipfsPath: string,
    hash: string,
  ): ApiResponse<boolean>;
  joinContext(contextId: string): ApiResponse<JoinContextResponse>;
  login(loginRequest: NearRequest): ApiResponse<LoginResponse>;
  requestChallenge(): ApiResponse<NodeChallenge>;
  addRootKey(rootKeyRequest: NearRequest): ApiResponse<RootKeyResponse>;
}
