import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import BlobsTable from '../components/blobs/BlobsTable';
import { ModalContent } from '../components/common/StatusModal';
import { apiClient } from '@calimero-network/calimero-client';

// Define BlobInfo interface to match BlobsTable expectations
export interface BlobInfo {
  blobId: string;
  size: number;
  fileType?: string;
  isDetecting?: boolean;
}

export default function BlobsPage() {
  const [errorMessage, setErrorMessage] = useState('');
  const [blobs, setBlobs] = useState<BlobInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedBlobId, setSelectedBlobId] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<ModalContent>({
    title: '',
    message: '',
    error: false,
  });

  const fetchBlobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await apiClient.blob().listBlobs();

      if (response.error) {
        setErrorMessage(response.error.message);
        return;
      }

      const blobsData = (response.data.blobs || []).map((blob) => ({
        ...blob,
        isDetecting: false,
      }));

      setBlobs(blobsData);

      // Start detecting file types for all blobs
      detectFileTypesForBlobs(blobsData);
    } catch (error) {
      setErrorMessage('Network error while fetching blobs');
    }

    setLoading(false);
  }, []);

  // Function to detect file types for multiple blobs efficiently
  const detectFileTypesForBlobs = async (blobsToDetect: BlobInfo[]) => {
    // Mark all blobs as detecting
    setBlobs((prevBlobs) =>
      prevBlobs.map((blob) => ({ ...blob, isDetecting: true })),
    );

    // Process blobs in parallel but limit concurrent requests
    const batchSize = 5; // Process 5 blobs at a time to avoid overwhelming the server

    for (let i = 0; i < blobsToDetect.length; i += batchSize) {
      const batch = blobsToDetect.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (blob) => {
          try {
            const fileType = await detectFileTypeFromBlobId(blob.blobId);

            setBlobs((prevBlobs) =>
              prevBlobs.map((b) =>
                b.blobId === blob.blobId
                  ? { ...b, fileType, isDetecting: false }
                  : b,
              ),
            );
          } catch (error) {
            console.warn(
              `Failed to detect type for blob ${blob.blobId}:`,
              error,
            );

            setBlobs((prevBlobs) =>
              prevBlobs.map((b) =>
                b.blobId === blob.blobId
                  ? { ...b, fileType: 'unknown', isDetecting: false }
                  : b,
              ),
            );
          }
        }),
      );
    }
  };

  // Function to detect file type from blob ID using HEAD request for efficiency
  const detectFileTypeFromBlobId = async (blobId: string): Promise<string> => {
    try {
      const response = await apiClient.blob().getBlobMetadata(blobId);

      if (response.error) {
        throw new Error(`HTTP ${response.error.code}`);
      }

      const mimeType = response.data.fileType;
      return mimeType;
    } catch (error) {
      console.warn('File type detection failed:', error);
      return 'unknown';
    }
  };

  const uploadBlob = async (file: File) => {
    setLoading(true);
    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    try {
      const response = await apiClient.blob().uploadBlob(file, (progress) => {
        setUploadProgress(progress);
      });

      if (response.error) {
        setDeleteStatus({
          title: 'Upload Failed',
          message: response.error.message || 'Failed to upload blob',
          error: true,
        });
        setShowStatusModal(true);
      } else {
        setDeleteStatus({
          title: 'Upload Successful',
          message: `File "${file.name}" uploaded successfully. Blob ID: ${response.data.blobId}`,
          error: false,
        });
        setShowStatusModal(true);

        // Refresh the blob list to show the new upload
        await fetchBlobs();
      }
    } catch (error) {
      setDeleteStatus({
        title: 'Upload Failed',
        message: `Network error while uploading file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: true,
      });
      setShowStatusModal(true);
    }

    setLoading(false);
    setIsUploading(false);
    setUploadProgress(0);
  };

  const deleteBlob = async () => {
    if (!selectedBlobId) return;

    setShowActionDialog(false);
    setLoading(true);

    try {
      // Use the calimero client deleteBlob method
      const response = await apiClient.blob().deleteBlob(selectedBlobId);

      if (response.error) {
        setDeleteStatus({
          title: 'Delete Failed',
          message: response.error.message || 'Failed to delete blob',
          error: true,
        });
      } else {
        setDeleteStatus({
          title: 'Delete Successful',
          message: 'Blob and its metadata have been successfully deleted.',
          error: false,
        });
        // Refresh the blob list
        await fetchBlobs();
      }
    } catch (error) {
      setDeleteStatus({
        title: 'Delete Failed',
        message: 'Network error while deleting blob',
        error: true,
      });
    }

    setShowStatusModal(true);
    setLoading(false);
    setSelectedBlobId('');
  };

  const downloadBlob = async (blobId: string) => {
    try {
      setLoading(true);

      // Use the calimero client downloadBlob method
      const blob = await apiClient.blob().downloadBlob(blobId);

      // Try to detect file type from blob content
      const mimeType = await detectFileTypeFromBlobId(blobId);

      // Create a download link with proper MIME type
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: mimeType }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = blobId;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(
        `Failed to download blob: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const showDeleteDialog = (blobId: string) => {
    setSelectedBlobId(blobId);
    setShowActionDialog(true);
  };

  const closeModal = () => {
    setShowStatusModal(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    fetchBlobs();
  }, [fetchBlobs]);

  return (
    <FlexLayout>
      <Navigation />
      <PageContentWrapper>
        <BlobsTable
          blobs={blobs}
          loading={loading}
          errorMessage={errorMessage}
          showStatusModal={showStatusModal}
          closeModal={closeModal}
          deleteStatus={deleteStatus}
          showActionDialog={showActionDialog}
          setShowActionDialog={setShowActionDialog}
          showDeleteDialog={showDeleteDialog}
          deleteBlob={deleteBlob}
          downloadBlob={downloadBlob}
          formatFileSize={formatFileSize}
          uploadBlob={uploadBlob}
          refreshBlobs={fetchBlobs}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
