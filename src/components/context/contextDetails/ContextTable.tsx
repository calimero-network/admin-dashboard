import React from 'react';
import styled from 'styled-components';
import translations from '../../../constants/en.global.json';
import { ContentCard } from '../../common/ContentCard';
import OptionsHeader, { TableOptions } from '../../common/OptionsHeader';
import ListTable from '../../common/ListTable';
import userRowItem from './UserRowItem';
import { DetailsOptions } from '../../../constants/ContextConstants';
import DetailsCard from './DetailsCard';
import { ContextDetails } from '../../../types/context';
import { ContextStorage } from '@calimero-network/calimero-client/lib/api/nodeApi';

const FlexWrapper = styled.div`
  flex: 1;
`;

interface ContextTableProps {
  contextDetails: ContextDetails;
  contextDetailsError: string | null;
  contextUsers: { identity: string }[];
  contextUsersError: string | null;
  contextStorage: ContextStorage;
  contextStorageError: string | null;
  navigateToContextList: () => void;
  currentOption: string;
  setCurrentOption: (option: string) => void;
  tableOptions: TableOptions[];
}

export default function ContextTable(props: ContextTableProps) {
  const t = translations.contextPage.contextDetails;

  return (
    <ContentCard
      headerBackText={t.title}
      headerOnBackClick={props.navigateToContextList}
    >
      <FlexWrapper>
        <OptionsHeader
          tableOptions={props.tableOptions}
          showOptionsCount={true}
          currentOption={props.currentOption}
          setCurrentOption={props.setCurrentOption}
        />
        {props.currentOption === DetailsOptions.DETAILS && (
          <DetailsCard
            details={props.contextDetails}
            detailsErrror={props.contextDetailsError}
            contextStorage={props.contextStorage}
            contextStorageError={props.contextStorageError}
          />
        )}
        {props.currentOption === DetailsOptions.USERS && (
          <ListTable<{ identity: string }>
            numOfColumns={1}
            listItems={props.contextUsers || []}
            error={props.contextUsersError ?? ''}
            listHeaderItems={['Identity']}
            rowItem={userRowItem}
            roundTopItem={true}
            noItemsText={t.noUsersText}
          />
        )}
      </FlexWrapper>
    </ContentCard>
  );
}
