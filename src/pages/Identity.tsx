import React, { useEffect, useState } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import { useNavigate } from 'react-router-dom';
import PageContentWrapper from '../components/common/PageContentWrapper';
import IdentityTable from '../components/identity/IdentityTable';
import { RootKeyObject, mapApiResponseToObjects } from '../utils/rootkey';
import apiClient from '../api';

export interface RootKey {
  signingKey: string;
}

export default function IdentityPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState('');
  const [rootKeys, setRootKeys] = useState<RootKeyObject[]>([]);
  useEffect(() => {
    const setDids = async () => {
      setErrorMessage('');
      const didResponse = await apiClient.node().getDidList();
      if (didResponse.error) {
        setErrorMessage(didResponse.error.message);
        return;
      } else {
        const rootKeyObjectsList = mapApiResponseToObjects(didResponse.data);
        setRootKeys(rootKeyObjectsList);
      }
    };
    setDids();
  }, []);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <IdentityTable
          onAddRootKey={() => navigate('/identity/root-key')}
          rootKeysList={rootKeys}
          onCopyKeyClick={(publicKey: string) =>
            navigator.clipboard.writeText(publicKey)
          }
          errorMessage={errorMessage}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
