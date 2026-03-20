import React from 'react';
import styled from 'styled-components';
import {
  RootKey,
  ClientKey,
} from '@calimero-network/calimero-client/lib/api/adminApi';
import { ContentCard } from '../common/ContentCard';
import ListTable from '../common/ListTable';

const TableWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: var(--bg-secondary);
`;

const TabsContainer = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
`;

const Tab = styled.button<{ $isActive: boolean }>`
  background: ${(props) =>
    props.$isActive ? 'var(--accent-light)' : 'transparent'};
  border: 1px solid
    ${(props) =>
      props.$isActive ? 'rgba(165, 255, 17, 0.35)' : 'var(--border-color)'};
  color: ${(props) =>
    props.$isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  transition: all 0.15s ease;

  &:hover {
    background: var(--accent-light);
    color: var(--accent-primary);
  }
`;

const FlexWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

const identityGridTemplate = 'minmax(160px, 1.1fr) 140px minmax(280px, 1.8fr)';

const RowItem = styled.div`
  display: grid;
  grid-template-columns: ${identityGridTemplate};
  gap: 1rem;
  align-items: center;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid var(--border-color);
  font-size: 0.875rem;
  line-height: 1.25rem;
  transition: background-color 0.15s ease;

  &:hover {
    background: rgba(165, 255, 17, 0.05);
  }

  .type {
    color: var(--text-primary);
    min-width: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .date {
    min-width: 0;
    color: var(--text-secondary);
  }

  .key {
    min-width: 0;
    color: var(--text-secondary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
    word-break: break-all;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(120px, 1fr) 120px minmax(180px, 1.4fr);
    gap: 0.75rem;
    padding: 0.875rem 1rem;
  }
`;

interface IdentityTableProps {
  keysList: (RootKey | ClientKey)[];
  keyType: 'root' | 'client';
  onKeyTypeChange: (type: 'root' | 'client') => void;
  errorMessage: string;
}

export default function IdentityTable({
  keysList,
  keyType,
  onKeyTypeChange,
  errorMessage,
}: IdentityTableProps) {
  const getKeyIdentifier = (key: RootKey | ClientKey): string => {
    if ('public_key' in key) {
      return key.public_key;
    }
    return key.client_id;
  };

  const getKeyName = (key: RootKey | ClientKey): string => {
    if ('public_key' in key) {
      return key.auth_method;
    }
    return key.name || 'Unknown';
  };

  const getTableHeaders = () => {
    if (keyType === 'root') {
      const rootKeys = keysList.filter(
        (key): key is RootKey => 'public_key' in key,
      );
      const hasOnlyUsernamePasswordKeys =
        rootKeys.length > 0 &&
        rootKeys.every((key) => key.auth_method === 'user_password');

      return [
        'AUTH METHOD',
        'CREATED',
        hasOnlyUsernamePasswordKeys ? 'USERNAME' : 'PUBLIC KEY',
      ];
    }
    return ['NAME', 'CREATED', 'CLIENT ID'];
  };

  return (
    <>
      <ContentCard
        headerTitle={'Current Identities'}
        headerDescription={
          keyType === 'root'
            ? 'Review the root keys that control this node.'
            : 'Review the client keys issued from your root identities.'
        }
        isOverflow={true}
      >
        <TableWrapper>
          <TabsContainer>
            <Tab
              $isActive={keyType === 'root'}
              onClick={() => onKeyTypeChange('root')}
            >
              Root Keys
            </Tab>
            <Tab
              $isActive={keyType === 'client'}
              onClick={() => onKeyTypeChange('client')}
            >
              Client Keys
            </Tab>
          </TabsContainer>
          <TabsContainer>
            <Tab $isActive={true} onClick={() => undefined}>
              Active ({keysList.length})
            </Tab>
          </TabsContainer>
          <FlexWrapper>
            <ListTable
              listHeaderItems={getTableHeaders()}
              numOfColumns={3}
              gridTemplateColumns={identityGridTemplate}
              listItems={keysList}
              rowItem={(item, id, lastIndex) => (
                <RowItem key={id}>
                  <div className="type">{getKeyName(item)}</div>
                  <div className="date">
                    {new Date(item.created_at * 1000).toLocaleDateString()}
                  </div>
                  <div className="key">{getKeyIdentifier(item)}</div>
                </RowItem>
              )}
              roundTopItem={true}
              noItemsText={'No active keys'}
              error={errorMessage}
            />
          </FlexWrapper>
        </TableWrapper>
      </ContentCard>
    </>
  );
}
