import { Header, createAuthHeader } from '@calimero-is-near/calimero-p2p-sdk';
import { getAppEndpointKey } from '../../utils/storage';
import { HttpClient } from '../httpClient';
import { ApiResponse, ResponseData } from '../response';

export const ADMIN_UI = 'admin-ui';

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

export interface ContextList {
  contexts: Context[];
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

export interface ApiContext {
  context: Context;
}

interface RootkeyResponse {
  client_keys: ClientKey[];
  contexts: Context[];
  root_keys: ApiRootKey[];
}

export interface ListApplicationsResponse {
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

export interface DeleteContextResponse {
  isDeleted: boolean;
}

export class NodeDataSource {
  private client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }

  async getInstalledApplications(): ApiResponse<ListApplicationsResponse> {
    try {
      const headers: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
        ADMIN_UI,
      );
      const response: ResponseData<ListApplicationsResponse> =
        await this.client.get<ListApplicationsResponse>(
          `${getAppEndpointKey()}/admin-api/applications`,
          headers ?? {},
        );
      return response;
    } catch (error) {
      console.error('Error fetching installed applications:', error);
      return {
        error: {
          code: 500,
          message: 'Failed to fetch installed applications.',
        },
      };
    }
  }

  async getContexts(): ApiResponse<ContextList> {
    try {
      const headers: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
        ADMIN_UI,
      );
      const response = await this.client.get<ContextList>(
        `${getAppEndpointKey()}/admin-api/contexts`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching contexts:', error);
      return { error: { code: 500, message: 'Failed to fetch context data.' } };
    }
  }

  async getContext(contextId: string): ApiResponse<ApiContext> {
    try {
      const headers: Header | null = await createAuthHeader(
        contextId,
        ADMIN_UI,
      );
      const response = await this.client.get<ApiContext>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return { error: { code: 500, message: 'Failed to fetch context data.' } };
    }
  }

  async getContextClientKeys(
    contextId: string,
  ): ApiResponse<ContextClientKeysList> {
    try {
      const headers: Header | null = await createAuthHeader(
        contextId,
        ADMIN_UI,
      );
      const response = await this.client.get<ContextClientKeysList>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/client-keys`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context client keys.' },
      };
    }
  }

  async getContextUsers(contextId: string): ApiResponse<ContextUsersList> {
    try {
      const headers: Header | null = await createAuthHeader(
        contextId,
        ADMIN_UI,
      );
      const response = await this.client.get<ContextUsersList>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/users`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context users.' },
      };
    }
  }

  async getContextStorageUsage(contextId: string): ApiResponse<ContextStorage> {
    try {
      const headers: Header | null = await createAuthHeader(
        contextId,
        ADMIN_UI,
      );
      const response = await this.client.get<ContextStorage>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}/storage`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error fetching context storage usage:', error);
      return {
        error: { code: 500, message: 'Failed to fetch context storage usage.' },
      };
    }
  }

  async deleteContext(contextId: string): ApiResponse<DeleteContextResponse> {
    try {
      const headers: Header | null = await createAuthHeader(
        contextId,
        ADMIN_UI,
      );
      const response = await this.client.delete<DeleteContextResponse>(
        `${getAppEndpointKey()}/admin-api/contexts/${contextId}`,
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error deleting context:', error);
      return { error: { code: 500, message: 'Failed to delete context.' } };
    }
  }

  async startContexts(
    applicationId: string,
    initFunction: string,
    initArguments: string,
  ): Promise<boolean> {
    try {
      const headers: Header | null = await createAuthHeader(
        JSON.stringify({
          applicationId,
          initFunction,
          initArguments,
        }),
        ADMIN_UI,
      );
      const response = await this.client.post<Context>(
        `${getAppEndpointKey()}/admin-api/contexts`,
        {
          applicationId: applicationId,
          ...(initFunction && { initFunction }),
          ...(initArguments && { initArgs: JSON.stringify(initArguments) }),
        },
        headers ?? {},
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
      const headers: Header | null = await createAuthHeader(
        getAppEndpointKey() as string,
        ADMIN_UI,
      );
      const response = await this.client.get<RootkeyResponse>(
        `${getAppEndpointKey()}/admin-api/did`,
        headers ?? {},
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

  async installApplication(
    selectedPackage: string,
    selectedVersion: string,
  ): ApiResponse<boolean> {
    try {
      const headers: Header | null = await createAuthHeader(
        JSON.stringify({
          selectedPackage,
          selectedVersion,
        }),
        ADMIN_UI,
      );
      const response: ResponseData<boolean> = await this.client.post<boolean>(
        `${getAppEndpointKey()}/admin-api/install-application`,
        {
          application: selectedPackage,
          version: selectedVersion,
        },
        headers ?? {},
      );
      return response;
    } catch (error) {
      console.error('Error installing application:', error);
      return {
        error: { code: 500, message: 'Failed to install application.' },
      };
    }
  }
}
