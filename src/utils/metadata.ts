import { AppMetadata } from "../pages/InstallApplication";

export function createAppMetadata(application: AppMetadata): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(application)));
}

export function parseAppMetadata(metadata: number[]): AppMetadata | null {
  try {
    if (metadata.length === 0) {
      return null;
    }

    var appMetadata: AppMetadata = JSON.parse(
      new TextDecoder().decode(new Uint8Array(metadata)),
    );
    return appMetadata;
  } catch (e) {
    return null;
  }
}
