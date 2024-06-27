import {
  ContextStorage,
  Context,
  ETHRootKey,
  HealthRequest,
  HealthStatus,
  NearRootKey,
  ContextClientKeysList,
  ContextUsersList,
  ListApplicationsResponse,
  ApiContext,
  ContextList,
} from './dataSource/NodeDataSource';
import { ApiResponse } from './response';

export interface NodeApi {
  getInstalledApplications(): ApiResponse<ListApplicationsResponse>;
  getContexts(): ApiResponse<ContextList>;
  getContext(contextId: string): ApiResponse<ApiContext>;
  getContext(contextId: string): ApiResponse<Context>;
  getContextClientKeys(contextId: string): ApiResponse<ContextClientKeysList>;
  getContextUsers(contextId: string): ApiResponse<ContextUsersList>;
  deleteContext(contextId: string): Promise<Boolean>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): Promise<boolean>;
  getDidList(): Promise<(ETHRootKey | NearRootKey)[]>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
  getContextStorageUsage(contextId: string): ApiResponse<ContextStorage>;
  installApplication(
    selectedPackage: string,
    selectedVersion: string,
  ): ApiResponse<boolean>;
}
