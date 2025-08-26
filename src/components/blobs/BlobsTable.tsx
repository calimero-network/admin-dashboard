import React from 'react';
import styled from 'styled-components';
import { ContentCard } from '../common/ContentCard';
import ListTable from '../common/ListTable';
import StatusModal, { ModalContent } from '../common/StatusModal';
import ActionDialog from '../common/ActionDialog';
import Loading from '../common/Loading';
import BlobRowItem from './BlobRowItem';

// Define BlobInfo interface locally
interface BlobInfo {
  blobId: string;
  size: number;
  fileType?: string;
  isDetecting?: boolean;
}

const FlexWrapper = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

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

const HiddenFileInput = styled.input`
  display: none;
`;

const UploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4rem 2rem;
  min-height: 400px;
`;

const UploadTitle = styled.h2`
  color: #4cfafc;
  font-size: 1.5rem;
  margin: 0 0 1rem 0;
  text-align: center;
`;

const FileName = styled.div`
  color: #ccc;
  font-size: 0.875rem;
  text-align: center;
  margin-bottom: 2rem;
  word-break: break-all;
  max-width: 400px;
`;

const ProgressContainer = styled.div`
  width: 100%;
  max-width: 400px;
  margin-bottom: 1.5rem;
`;

const ProgressLabel = styled.div`
  color: #fff;
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  overflow: hidden;
`;

const ProgressBar = styled.div<{ progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, #4cfafc 0%, #00e4ff 100%);
  border-radius: 0.375rem;
  width: ${(props) => props.progress}%;
  transition: width 0.3s ease;
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
  uploadBlob: (file: File) => void;
  refreshBlobs: () => void;
  isUploading: boolean;
  uploadProgress: number;
}

export default function BlobsTable(props: BlobsTableProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingFileName, setUploadingFileName] = React.useState<string>('');

  const t = {
    title: 'Blob Storage',
    uploadText: 'Upload',
    actionDialog: {
      title: 'Delete Blob',
      subtitle:
        'Are you sure you want to delete this blob? This action cannot be undone.',
      buttonActionText: 'Delete',
    },
  };

  const renderUploadProgress = () => {
    return (
      <UploadContainer>
        <UploadTitle>Uploading File</UploadTitle>
        <FileName>{uploadingFileName}</FileName>
        <ProgressContainer>
          <ProgressLabel>
            <span>Progress</span>
            <span>{props.uploadProgress.toFixed(1)}%</span>
          </ProgressLabel>
          <ProgressBarContainer>
            <ProgressBar progress={props.uploadProgress} />
          </ProgressBarContainer>
        </ProgressContainer>
      </UploadContainer>
    );
  };

  const headersList = ['BLOB ID', 'SIZE', 'TYPE'];

  const handleUploadClick = () => {
    if (props.isUploading) return; // Prevent uploads during existing upload
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingFileName(file.name);
      props.uploadBlob(file);
      // Reset the input so the same file can be selected again if needed
      event.target.value = '';
    }
  };

  if (props.loading && !props.isUploading) {
    return (
      <ContentCard
        headerTitle={t.title}
        headerSecondOptionText={
          props.isUploading ? 'Uploading...' : t.uploadText
        }
        headerOnSecondOptionClick={handleUploadClick}
      >
        <HiddenFileInput
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept="*/*"
        />
        <Loading />
      </ContentCard>
    );
  }

  return (
    <ContentCard
      headerTitle={t.title}
      headerSecondOptionText={t.uploadText}
      headerOnSecondOptionClick={handleUploadClick}
    >
      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept="*/*"
      />
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
        {props.isUploading ? (
          renderUploadProgress()
        ) : props.errorMessage ? (
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
                key={item.blobId}
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
