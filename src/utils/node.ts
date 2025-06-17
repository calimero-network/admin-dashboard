import { getAppEndpointKey, setAppEndpointKey } from "@calimero-network/calimero-client";

export function getNodeUrl(): string {
  let storageKey = getAppEndpointKey();

  if (!storageKey) {
    let envKey: string = import.meta.env['VITE_NODE_URL'] ?? '';
    setAppEndpointKey(envKey);
    return envKey;
  }

  return storageKey ?? '';
}

export function getNearEnvironment(): string {
  return import.meta.env['VITE_NEAR_ENVIRONMENT'] ?? 'testnet';
}
