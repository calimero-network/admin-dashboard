import React from 'react';
import { AppDetails } from '../../../pages/ApplicationDetails';
import DetailsCard from './DetailsCard';
import { ContentCard } from '../../common/ContentCard';

interface ApplicationDetailsTableProps {
  applicationInformation: AppDetails;
  navigateToApplicationList: () => void;
  navigateToAddRelease: () => void;
}

export default function ApplicationDetailsTable({
  applicationInformation,
  navigateToApplicationList,
}: ApplicationDetailsTableProps) {
  return (
    <ContentCard
      headerBackText={'Application'}
      headerOnBackClick={navigateToApplicationList}
    >
      <DetailsCard details={applicationInformation.package} />
    </ContentCard>
  );
}
