import {
  Application,
  Context,
  ContextData,
  ContextsList,
  ETHRootKey,
  NearRootKey,
} from "./dataSource/NodeDataSource";

export interface NodeApi {
  getInstalledApplications(): Promise<Application[]>;
  getContexts(): Promise<ContextsList<Context>>;
  getContext(contextId: string): Promise<ContextData | null>;
  deleteContext(contextId: string): Promise<Boolean>;
  startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string
  ): Promise<boolean>;
  getDidList(): Promise<(ETHRootKey | NearRootKey)[]>;
}
