import { AppMetadata } from '../pages/InstallApplication';
import {
  ContextStorage,
  HealthRequest,
  HealthStatus,
  ContextClientKeysList,
  ContextUsersList,
  GetInstalledApplicationsResponse,
  DidResponse,
  DeleteContextResponse,
  JoinContextResponse,
  LoginRequest,
  LoginResponse,
  NodeChallenge,
  RootKeyResponse,
  InstallApplicationResponse,
  ContextIdentitiesResponse,
  CreateTokenResponse,
  UninstallApplicationResponse,
  CreateContextResponse,
  GetContextsResponse,
  Context,
  InstalledApplicationDetails,
} from './dataSource/NodeDataSource';
import { ApiResponse } from './response';

export interface NodeApi {
  getInstalledApplications(): ApiResponse<GetInstalledApplicationsResponse>;
  getInstalledApplicationDetails(
    appId: string,
  ): ApiResponse<InstalledApplicationDetails>;
  getContexts(): ApiResponse<GetContextsResponse>;
  getContext(contextId: string): ApiResponse<Context>;
  getContextClientKeys(contextId: string): ApiResponse<ContextClientKeysList>;
  getContextUsers(contextId: string): ApiResponse<ContextUsersList>;
  deleteContext(contextId: string): ApiResponse<DeleteContextResponse>;
  createContexts(
    applicationId: string,
    protocol: string,
  ): ApiResponse<CreateContextResponse>;
  getDidList(): ApiResponse<DidResponse>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
  getContextStorageUsage(contextId: string): ApiResponse<ContextStorage>;
  installApplication(
    application: AppMetadata,
  ): ApiResponse<InstallApplicationResponse>;
  joinContext(contextId: string): ApiResponse<JoinContextResponse>;
  login(loginRequest: LoginRequest): ApiResponse<LoginResponse>;
  requestChallenge(): ApiResponse<NodeChallenge>;
  addRootKey(rootKeyRequest: LoginRequest): ApiResponse<RootKeyResponse>;
  getContextIdentity(contextId: string): ApiResponse<ContextIdentitiesResponse>;
  createAccessToken(
    contextId: string,
    contextIdentity: string,
  ): ApiResponse<CreateTokenResponse>;
  uninstallApplication(
    applicationId: string,
  ): ApiResponse<UninstallApplicationResponse>;
}
