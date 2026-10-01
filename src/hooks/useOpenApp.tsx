import React, { useCallback, useState } from 'react';
import OpenAppConfirm from '../components/OpenAppConfirm';
import { useToast } from '../contexts/ToastContext';
import { getSettings } from '../utils/settings';
import {
  appDisplayName,
  decodeMetadata,
  type AppMetadata,
} from '../utils/appUtils';
import type { InstalledApplication } from '../utils/installedApps';
import {
  appFrontendOrigin,
  isAllowedAppFrontendUrl,
  isAppOriginApproved,
  openAppInNewTab,
  approveAppOrigin,
} from '../utils/openApp';

interface PendingOpen {
  frontendUrl: string;
  origin: string;
  app: InstalledApplication;
  metadata: AppMetadata | null;
}

export function useOpenApp() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingOpen | null>(null);

  const launch = useCallback(
    (frontendUrl: string, app: InstalledApplication) => {
      openAppInNewTab(frontendUrl, {
        applicationId: app.id,
        devMode: getSettings().developerMode,
      }).catch((e: unknown) => {
        toast.error(
          e instanceof Error ? e.message : 'Failed to open application',
        );
      });
    },
    [toast],
  );

  const requestOpen = useCallback(
    (frontendUrl: string, app: InstalledApplication) => {
      const origin = appFrontendOrigin(frontendUrl);
      if (
        !origin ||
        !isAllowedAppFrontendUrl(frontendUrl) ||
        isAppOriginApproved(app.id, origin)
      ) {
        launch(frontendUrl, app);
        return;
      }
      setPending({
        frontendUrl,
        origin,
        app,
        metadata: decodeMetadata(app.metadata),
      });
    },
    [launch],
  );

  const cancel = useCallback(() => setPending(null), []);

  const dialog = pending ? (
    <OpenAppConfirm
      appName={appDisplayName(pending.app, pending.metadata)}
      packageId={pending.metadata?.package}
      frontendUrl={pending.frontendUrl}
      onCancel={cancel}
      onConfirm={(remember) => {
        if (remember) approveAppOrigin(pending.app.id, pending.origin);
        setPending(null);
        launch(pending.frontendUrl, pending.app);
      }}
    />
  ) : null;

  return { requestOpen, dialog };
}
