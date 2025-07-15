import React from 'react';
import styled from 'styled-components';
import { truncateHash } from '../../utils/displayFunctions';
import MenuIconDropdown from '../common/MenuIconDropdown';
import { ClipboardDocumentIcon } from '@heroicons/react/24/solid';

interface BlobInfo {
  blob_id: string;
  size: number;
  fileType?: string;
  isDetecting?: boolean;
}

interface BlobRowItemProps {
  $hasBorders: boolean;
}

const RowItem = styled.div<BlobRowItemProps>`
  display: flex;
  width: 100%;
  align-items: center;
  gap: 1px;
  font-size: 0.875rem;
  font-optical-sizing: auto;
  font-weight: 500;
  font-style: normal;
  font-variation-settings: 'slnt' 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-smooth: never;
  line-height: 1.25rem;
  text-align: left;
  padding-right: 1.5rem;
  padding-left: 1.5rem;
  border-top: 1px solid #23262d;
  ${(props) => props.$hasBorders && `border-bottom: 1px solid #23262D;`}

  .row-item {
    padding: 0.75rem 0rem;
    height: 4.5rem;
    display: flex;
    align-items: center;
  }

  .blob-id {
    width: 35%;
  }

  .size {
    width: 35%;
  }

  .type {
    width: 24%;
  }

  .read {
    color: #9c9da3;
  }

  .copy-icon {
    height: 1.5rem;
    width: 1.5rem;
    color: #9c9da3;
    cursor: pointer;
  }
  .copy-icon:hover {
    color: #fff;
  }

  .menu-dropdown {
    padding: 0.75rem 0rem;
    height: 4.5rem;
    display: flex;
    justify-content: end;
    align-items: center;
    width: 10%;
  }
`;

interface BlobRowItemComponentProps {
  item: BlobInfo;
  id: number;
  count: number;
  showDeleteDialog: (blobId: string) => void;
  downloadBlob: (blobId: string) => void;
  formatFileSize: (bytes: number) => string;
}

export default function BlobRowItem({
  item,
  id,
  count,
  showDeleteDialog,
  downloadBlob,
  formatFileSize,
}: BlobRowItemComponentProps): JSX.Element {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error('Failed to copy text to clipboard: ', err);
    });
  };

  const getFileTypeDisplay = () => {
    if (item.isDetecting) {
      return 'detecting...';
    }

    if (item.fileType && item.fileType !== 'unknown') {
      return item.fileType.toUpperCase();
    }

    return 'N/A';
  };

  return (
    <RowItem key={item.blob_id} $hasBorders={id === count}>
      <div className="row-item blob-id read">
        <ClipboardDocumentIcon
          className="copy-icon"
          onClick={() => copyToClipboard(item.blob_id)}
        />
        <span>{truncateHash(item.blob_id)}</span>
      </div>
      <div className="row-item size read">{formatFileSize(item.size)}</div>
      <div className="row-item type read">{getFileTypeDisplay()}</div>
      <div className="menu-dropdown">
        <MenuIconDropdown
          options={[
            {
              title: 'Download blob',
              onClick: () => downloadBlob(item.blob_id),
            },
            {
              title: 'Delete blob',
              onClick: () => showDeleteDialog(item.blob_id),
            },
          ]}
        />
      </div>
    </RowItem>
  );
}
