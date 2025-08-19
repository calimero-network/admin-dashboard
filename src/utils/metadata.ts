import { AppMetadata } from '../pages/InstallApplication';

export function createAppMetadata(application: AppMetadata): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(application));
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


export function parseAppMetadataDetails(metadata: Uint8Array): AppMetadata | null {
  try {
    if (metadata.length === 0) {
      return null;
    }

    const appMetadata: AppMetadata = JSON.parse(
      new TextDecoder().decode(metadata),
    );
    return appMetadata;
  } catch (e) {
    return null;
  }
}