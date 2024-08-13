import React from 'react';

import { MetaMaskUIProvider } from '@metamask/sdk-react-ui';
import { Outlet } from 'react-router-dom';

export default function MetamaskRoute() {
  return (
    <MetaMaskUIProvider
      sdkOptions={{
        dappMetadata: {
          name: 'admin-dashboard',
        },
        checkInstallationOnAllCalls: true,
      }}
    >
      <Outlet />
    </MetaMaskUIProvider>
  );
}
