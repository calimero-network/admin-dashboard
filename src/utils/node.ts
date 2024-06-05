import { NetworkId } from "@near-wallet-selector/core";

export function getNodeUrl(): string {
  return import.meta.env["VITE_NODE_URL"] ?? "missing-node-env-var";
}

export function getNearEnvironment(): NetworkId {
  return (
    (import.meta.env["VITE_NEAR_ENVIRONMENT"] as NetworkId) ??
    ("testnet" as NetworkId)
  );
}
