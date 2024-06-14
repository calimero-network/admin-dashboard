import {
  Application,
  ClientKey,
  ApplicationStorageResponse,
  Context,
  ContextsList,
  ETHRootKey,
  HealthRequest,
  HealthStatus,
  NearRootKey,
  User,
} from "./dataSource/NodeDataSource";
import { ResponseData, ApiResponse } from "./response";

export interface NodeApi {
  getInstalledApplications(): Promise<Application[]>;
  getContexts(): Promise<ContextsList<Context>>;
  getContext(contextId: string): Promise<ResponseData<Context>>;
  getContextClientKeys(contextId: string): Promise<ResponseData<ClientKey[]>>;
  getContextUsers(contextId: string): Promise<ResponseData<User[]>>;
  deleteContext(contextId: string): Promise<Boolean>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): Promise<boolean>;
  getDidList(): Promise<(ETHRootKey | NearRootKey)[]>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
  getContextStorageUsage(contextId: string): Promise<ApplicationStorageResponse>;
}
