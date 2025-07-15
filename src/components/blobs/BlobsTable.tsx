import React from 'react';
import styled from 'styled-components';
import translations from '../../constants/en.global.json';
import { ContentCard } from '../common/ContentCard';
import ListTable from '../common/ListTable';
import StatusModal, { ModalContent } from '../common/StatusModal';
import ActionDialog from '../common/ActionDialog';
import Loading from '../common/Loading';
import BlobRowItem from './BlobRowItem';

// Define BlobInfo interface locally
interface BlobInfo {
  blob_id: string;
  size: number;
  fileType?: string;
  isDetecting?: boolean;
}

const FlexWrapper = styled.div`
  flex: 1;
  position: relative;

  .close-button {
    position: absolute;
    right: 0.875rem;
    top: 0.875rem;
    cursor: pointer;
    color: #fff;
    height: 1.5rem;
    width: 1.5rem;

    &:hover {
      color: #4cfafc;
    }
  }
`;

const ErrorWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  
  .error-text {
    color: #ef4444;
    font-size: 0.875rem;
    text-align: center;
  }
`;

interface BlobsTableProps {
  blobs: BlobInfo[];
  loading: boolean;
  errorMessage: string;
  showStatusModal: boolean;
  closeModal: () => void;
  deleteStatus: ModalContent;
  showActionDialog: boolean;
  setShowActionDialog: (show: boolean) => void;
  showDeleteDialog: (blobId: string) => void;
  deleteBlob: () => void;
  downloadBlob: (blobId: string) => void;
  formatFileSize: (bytes: number) => string;
  refreshBlobs: () => void;
}

export default function BlobsTable(props: BlobsTableProps) {
  const t = {
    title: 'Blob Storage',
    refreshText: 'Refresh',
    actionDialog: {
      title: 'Delete Blob',
      subtitle: 'Are you sure you want to delete this blob? This action cannot be undone.',
      buttonActionText: 'Delete'
    }
  };
  
  const headersList = ['BLOB ID', 'SIZE', 'TYPE'];

  if (props.loading) {
    return (
      <ContentCard
        headerTitle={t.title}
        headerSecondOptionText={t.refreshText}
        headerOnSecondOptionClick={props.refreshBlobs}
      >
        <Loading />
      </ContentCard>
    );
  }

  return (
    <ContentCard
      headerTitle={t.title}
      headerSecondOptionText={t.refreshText}
      headerOnSecondOptionClick={props.refreshBlobs}
    >
      <StatusModal
        show={props.showStatusModal}
        closeModal={props.closeModal}
        modalContent={props.deleteStatus}
      />
      <ActionDialog
        show={props.showActionDialog}
        closeDialog={() => props.setShowActionDialog(false)}
        onConfirm={props.deleteBlob}
        title={t.actionDialog.title}
        subtitle={t.actionDialog.subtitle}
        buttonActionText={t.actionDialog.buttonActionText}
      />
      <FlexWrapper>
        {props.errorMessage ? (
          <ErrorWrapper>
            <div className="error-text">{props.errorMessage}</div>
          </ErrorWrapper>
        ) : (
          <ListTable
            listHeaderItems={headersList}
            listItems={props.blobs}
            noItemsText="No blobs found"
            listDescription=""
            rowItem={(item, index) => (
              <BlobRowItem
                key={item.blob_id}
                item={item}
                id={index}
                count={props.blobs.length - 1}
                showDeleteDialog={props.showDeleteDialog}
                downloadBlob={props.downloadBlob}
                formatFileSize={props.formatFileSize}
              />
            )}
            numOfColumns={3}
            roundTopItem={true}
          />
        )}
      </FlexWrapper>
    </ContentCard>
  );
} 