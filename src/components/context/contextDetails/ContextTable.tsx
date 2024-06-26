import React from 'react';
import styled from 'styled-components';
import translations from '../../../constants/en.global.json';
import { ContentCard } from '../../common/ContentCard';
import OptionsHeader, { TableOptions } from '../../common/OptionsHeader';
import ListTable from '../../common/ListTable';
import clientKeyRowItem from './ClientKeyRowItem';
import userRowItem from './UserRowItem';
import { DetailsOptions } from '../../../constants/ContextConstants';
import DetailsCard from './DetailsCard';
import { ApiResponse, ContextObject } from '../../../pages/ContextDetails';
import {
  ClientKey,
  ContextStorage,
  User,
} from '../../../api/dataSource/NodeDataSource';

const FlexWrapper = styled.div`
  flex: 1;
`;

interface ContextTableProps {
  contextDetails: ApiResponse<ContextObject>;
  contextClientKeys: ApiResponse<ClientKey[]>;
  contextUsers: ApiResponse<User[]>;
  contextStorage: ApiResponse<ContextStorage>;
  navigateToContextList: () => void;
  currentOption: string;
  setCurrentOption: (option: string) => void;
  tableOptions: TableOptions[];
}

export default function ContextTable({
  contextDetails,
  contextClientKeys,
  contextUsers,
  contextStorage,
  navigateToContextList,
  currentOption,
  setCurrentOption,
  tableOptions,
}: ContextTableProps) {
  const t = translations.contextPage.contextDetails;

  return (
    <ContentCard
      headerBackText={t.title}
      headerOnBackClick={navigateToContextList}
    >
      <FlexWrapper>
        <OptionsHeader
          tableOptions={tableOptions}
          showOptionsCount={true}
          currentOption={currentOption}
          setCurrentOption={setCurrentOption}
        />
        {currentOption === DetailsOptions.DETAILS && (
          <DetailsCard
            details={contextDetails}
            contextStorage={contextStorage}
          />
        )}
        {currentOption === DetailsOptions.CLIENT_KEYS && (
          <ListTable<ClientKey>
            listDescription={t.clientKeysListDescription}
            numOfColumns={3}
            listHeaderItems={['TYPE', 'ADDED', 'PUBLIC KEY']}
            listItems={contextClientKeys.data || []}
            error={contextClientKeys.error ?? ''}
            rowItem={clientKeyRowItem}
            roundTopItem={true}
            noItemsText={t.noClientKeysText}
          />
        )}
        {currentOption === DetailsOptions.USERS && (
          <ListTable<User>
            numOfColumns={2}
            listItems={contextUsers.data || []}
            error={contextUsers.error ?? ''}
            listHeaderItems={['USER ID', 'JOINED']}
            rowItem={userRowItem}
            roundTopItem={true}
            noItemsText={t.noUsersText}
          />
        )}
      </FlexWrapper>
    </ContentCard>
  );
}
