import {
  Header,
  createAuthHeader,
} from '@calimero-is-near/calimero-p2p-sdk';
import { getAppEndpointKey } from '../../utils/storage';
import { HttpClient } from '../httpClient';
import { ApiResponse, ResponseData } from '../response';

enum Network {
  NEAR = 'NEAR',
  ETH = 'ETH',
}

export interface ContextClientKeysList {
  clientKeys: ClientKey[];
}

export interface ContextUsersList {
  contextUsers: User[];
}

export interface User {
  userId: string;
  joinedAt: number;
  contextId: string;
}

export interface Application {
  id: string;
  version: string;
}

export interface SigningKey {
  signingKey: string;
}

export interface Context {
  applicationId: string;
  id: string;
  signingKey: SigningKey;
}

export interface ContextsList<T> {
  joined: T[];
  invited: T[];
}

export interface RootKey {
  signingKey: string;
  createdAt: number;
}

export interface ETHRootKey extends RootKey {
  type: Network.ETH;
  chainId: number;
}

export interface NearRootKey extends RootKey {
  type: Network.NEAR;
}

interface NetworkType {
  type: Network;
  chainId?: number;
}

interface ApiRootKey {
  signing_key: string;
  wallet: NetworkType;
  created_at: number;
}

export interface ClientKey {
  signingKey: string;
  walletType: NetworkType;
  createdAt: number;
  applicationId: string;
}

interface RootkeyResponse {
  client_keys: ClientKey[];
  contexts: Context[];
  root_keys: ApiRootKey[];
}

interface ListApplicationsResponse {
  apps: Application[];
}

export interface HealthRequest {
  url: String;
}

export interface HealthStatus {
  status: String;
}

export interface ContextStorage {
  sizeInBytes: number;
}

export class NodeDataSource {
  private client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }

  async getInstalledApplications(): Promise<Application[]> {
    try {
      const authHeaders: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
      );
      const response: ResponseData<ListApplicationsResponse> =
        await this.client.get<ListApplicationsResponse>(
          `${getAppEndpointKey()}/admin-api/applications`,
          authHeaders ?? {},
        );
      return response?.data?.apps ?? [];
    } catch (error) {
      console.error('Error fetching installed applications:', error);
      return [];
    }
  }

  async getContexts(): Promise<ContextsList<Context>> {
    try {
      const authHeaders: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
      );
      const response = await this.client.get<Context[]>(
        `${getAppEndpointKey()}/admin-api/contexts`,
        authHeaders ?? {},
      );
      if (response?.data) {
        // invited is empty for now as we don't have this endpoint available
        // will be left as "no invites" until this becomes available
        return {
          joined: response.data,
          invited: [],
        };
      } else {
        return { joined: [], invited: [] };
      }
    } catch (error) {
      console.error('Error fetching contexts:', error);
      return { joined: [], invited: [] };
    }
  }

  async getContext(contextId: string): Promise<ResponseData<Context>> {
    try {
      const authHeaders: Header | null = await createAuthHeader(contextId);
      const response = await this.client.get<Context>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}`,
        authHeaders ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return { error: { code: 500, message: 'Failed to fetch context data.' } };
    }
  }

  async getContextClientKeys(
    contextId: string,
  ): Promise<ResponseData<ContextClientKeysList>> {
    try {
      const authHeaders: Header | null = await createAuthHeader(contextId);
      const response = await this.client.get<ContextClientKeysList>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/client-keys`,
        authHeaders ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context client keys.' },
      };
    }
  }

  async getContextUsers(
    contextId: string,
  ): Promise<ResponseData<ContextUsersList>> {
    try {
      const authHeaders: Header | null = await createAuthHeader(contextId);
      const response = await this.client.get<ContextUsersList>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/users`,
        authHeaders ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context users.' },
      };
    }
  }

  async getContextStorageUsage(
    contextId: string,
  ): Promise<ResponseData<ContextStorage>> {
    try {
      const authHeaders: Header | null = await createAuthHeader(contextId);
      const response = await this.client.get<ContextStorage>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/storage`,
        authHeaders ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context storage usage:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context storage usage.' },
      };
    }
  }

  async deleteContext(contextId: string): Promise<boolean> {
    try {
      const response = await this.client.delete<boolean>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}`,
      );
      if (response?.data) {
        return response.data;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error deleting context:', error);
      return false;
    }
  }

  async startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): Promise<boolean> {
    try {
      const authHeaders: Header | null = await createAuthHeader(
        `${applicationId}${initFunction}${initArguments}`,
      );
      const response = await this.client.post<Context>(
        `${getAppEndpointKey()}/admin-api/contexts`,
        {
          applicationId: applicationId,
          ...(initFunction && { initFunction }),
          ...(initArguments && { initArgs: JSON.stringify(initArguments) }),
        },
        authHeaders ?? {},
      );
      if (response?.data) {
        return !!response.data;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error starting contexts:', error);
      return true;
    }
  }

  async getDidList(): Promise<(ETHRootKey | NearRootKey)[]> {
    try {
      const authHeaders: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
      );
      const response = await this.client.get<RootkeyResponse>(
        `${getAppEndpointKey()}/admin-api/did`,
        authHeaders ?? {},
      );
      if (response?.data?.root_keys) {
        const rootKeys: (ETHRootKey | NearRootKey)[] =
          response?.data?.root_keys?.map((obj: ApiRootKey) => {
            if (obj.wallet.type === Network.NEAR) {
              return {
                signingKey: obj.signing_key,
                type: Network.NEAR,
                chainId: obj.wallet.chainId ?? 1,
                createdAt: obj.created_at,
              } as NearRootKey;
            } else {
              return {
                signingKey: obj.signing_key,
                type: Network.ETH,
                createdAt: obj.created_at,
                ...(obj.wallet.chainId !== undefined && {
                  chainId: obj.wallet.chainId,
                }),
              } as ETHRootKey;
            }
          });
        return rootKeys;
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error fetching DID list:', error);
      return [];
    }
  }

  async health(request: HealthRequest): ApiResponse<HealthStatus> {
    return await this.client.get<HealthStatus>(
      `${request.url}/admin-api/health`,
    );
  }
}
