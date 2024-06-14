import {
  Application,
  ClientKey,
  ContextStorage,
  Context,
  ContextsList,
  ETHRootKey,
  HealthRequest,
  HealthStatus,
  NearRootKey,
  User,
} from "./dataSource/NodeDataSource";
import { ApiResponse } from "./response";

export interface NodeApi {
  getInstalledApplications(): Promise<Application[]>;
  getContexts(): Promise<ContextsList<Context>>;
  getContext(contextId: string): ApiResponse<Context>;
  getContextClientKeys(contextId: string): ApiResponse<ClientKey[]>;
  getContextUsers(contextId: string): ApiResponse<User[]>;
  deleteContext(contextId: string): Promise<Boolean>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): Promise<boolean>;
  getDidList(): Promise<(ETHRootKey | NearRootKey)[]>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
  getContextStorageUsage(contextId: string): ApiResponse<ContextStorage>;
}
