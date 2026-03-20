import React, { useEffect, useState, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import IdentityTable from '../components/identity/IdentityTable';
import { apiClient } from '@calimero-network/calimero-client';
import {
  ClientKey,
  RootKey,
} from '@calimero-network/calimero-client/lib/api/adminApi';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import './IdentityPage.css';

type KeyType = 'root' | 'client';

export default function IdentityPage() {
  const [errorMessage, setErrorMessage] = useState('');
  const [rootKeys, setRootKeys] = useState<RootKey[]>([]);
  const [clientKeys, setClientKeys] = useState<ClientKey[]>([]);
  const [keyType, setKeyType] = useState<KeyType>('root');

  const toKeyArray = <T,>(raw: unknown): T[] => {
    if (Array.isArray(raw)) return raw as T[];
    if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: T[] }).data)) {
      return (raw as { data: T[] }).data;
    }
    return [];
  };

  const fetchRootKeys = useCallback(async () => {
    setErrorMessage('');
    const rootKeysResponse = await apiClient.admin().getRootKeys();
    if (rootKeysResponse.error) {
      setErrorMessage(rootKeysResponse.error.message);
      return;
    }
    setRootKeys(toKeyArray<RootKey>(rootKeysResponse.data));
  }, []);

  const fetchClientKeys = useCallback(async () => {
    setErrorMessage('');
    const clientKeysResponse = await apiClient.admin().getClientKeys();
    if (clientKeysResponse.error) {
      setErrorMessage(clientKeysResponse.error.message);
      return;
    }
    setClientKeys(toKeyArray<ClientKey>(clientKeysResponse.data));
  }, []);

  useEffect(() => {
    if (keyType === 'root') {
      fetchRootKeys();
    } else {
      fetchClientKeys();
    }
  }, [keyType, fetchRootKeys, fetchClientKeys]);

  const safeRootKeys = Array.isArray(rootKeys) ? rootKeys : [];
  const safeClientKeys = Array.isArray(clientKeys) ? clientKeys : [];
  const activeRootKeys = safeRootKeys.filter((key) => !key.revoked_at);
  const activeClientKeys = safeClientKeys.filter((key) => !key.revoked_at);
  const currentKeys = keyType === 'root' ? activeRootKeys : activeClientKeys;

  const [exportToast, setExportToast] = useState<string | null>(null);

  const handleExportDID = async () => {
    try {
      const res = await apiClient.admin().getRootKeys();
      const keys = toKeyArray<RootKey>(res.data);
      const did = JSON.stringify(keys, null, 2);
      await navigator.clipboard.writeText(did);
      setExportToast('DID copied to clipboard');
    } catch {
      setExportToast('Failed to export DID');
    }
    setTimeout(() => setExportToast(null), 3000);
  };

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Identity</h1>
            <p>Root and client keys for this node</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleExportDID}>
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
            Export DID
          </button>
        </div>
        {exportToast && (
          <div className={`identity-toast ${exportToast.includes('Failed') ? 'error' : 'success'}`}>
            {exportToast}
          </div>
        )}
        <IdentityTable
          keysList={currentKeys}
          keyType={keyType}
          onKeyTypeChange={setKeyType}
          errorMessage={errorMessage}
        />
      </main>
    </div>
  );
}
