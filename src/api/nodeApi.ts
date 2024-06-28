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
} from './dataSource/NodeDataSource';
import { ApiResponse } from './response';

export interface NodeApi {
  getInstalledApplications(): ApiResponse<ListApplicationsResponse>;
  getContexts(): ApiResponse<ContextList>;
  getContext(contextId: string): ApiResponse<ApiContext>;
  getContext(contextId: string): ApiResponse<Context>;
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
  ): ApiResponse<boolean>;
}
