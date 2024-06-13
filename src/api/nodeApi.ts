import {
  Application,
  Context,
  ContextsList,
  ETHRootKey,
  HealthRequest,
  HealthStatus,
  NearRootKey,
} from "./dataSource/NodeDataSource";
import { ApiResponse } from "./response";

export interface NodeApi {
  getInstalledApplications(): Promise<Application[]>;
  getContexts(): Promise<ContextsList<Context>>;
  getContext(contextId: string): Promise<Context | null>;
  deleteContext(contextId: string): Promise<Boolean>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string
  ): Promise<boolean>;
  getDidList(): Promise<(ETHRootKey | NearRootKey)[]>;
  health(request: HealthRequest): ApiResponse<HealthStatus>;
}
