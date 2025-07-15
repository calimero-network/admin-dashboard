import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '../components/Navigation';
import { FlexLayout } from '../components/layout/FlexLayout';
import PageContentWrapper from '../components/common/PageContentWrapper';
import BlobsTable from '../components/blobs/BlobsTable';
import { ModalContent } from '../components/common/StatusModal';
import { apiClient } from '@calimero-network/calimero-client';

// Define BlobInfo interface locally since it's not exported from the main package
interface BlobInfo {
  blob_id: string;
  size: number;
  fileType?: string; // Add optional file type
  isDetecting?: boolean; // Add loading state for type detection
}

export default function BlobsPage() {
  const [errorMessage, setErrorMessage] = useState('');
  const [blobs, setBlobs] = useState<BlobInfo[]>([]);
  const [loading, setLoading] = useState(false);
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
      console.log('response', response);
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
            const fileType = await detectFileTypeFromBlobId(blob.blob_id);

            setBlobs((prevBlobs) =>
              prevBlobs.map((b) =>
                b.blob_id === blob.blob_id
                  ? { ...b, fileType, isDetecting: false }
                  : b,
              ),
            );
          } catch (error) {
            console.warn(
              `Failed to detect type for blob ${blob.blob_id}:`,
              error,
            );

            setBlobs((prevBlobs) =>
              prevBlobs.map((b) =>
                b.blob_id === blob.blob_id
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
      console.log('response detectFileTypeFromBlobId', response);

      if (response.error) {
        throw new Error(`HTTP ${response.error.code}`);
      }

      const mimeType = response.data.fileType;
      // Convert MIME type to simple extension for display
      return mimeTypeToExtension(mimeType);
    } catch (error) {
      console.warn('File type detection failed:', error);
      return 'unknown';
    }
  };

  // Helper to convert MIME type to file extension for display
  const mimeTypeToExtension = (mimeType: string): string => {
    const mimeMap: { [key: string]: string } = {
      'application/wasm': 'wasm',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/gzip': 'gz',
      'application/x-executable': 'elf',
      'application/java-vm': 'class',
      'application/x-msdownload': 'exe',
      'application/x-7z-compressed': '7z',
      'application/x-bzip2': 'bz2',
      'application/vnd.rar': 'rar',
      'text/html': 'html',
      'application/json': 'json',
      'text/javascript': 'js',
      'text/plain': 'txt',
      'application/octet-stream': 'bin',
    };

    return mimeMap[mimeType] || 'unknown';
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
          message: 'Blob metadata has been successfully deleted.',
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
      const { filename, mimeType } = await detectFileType(blob, blobId);

      // Create a download link with proper MIME type
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: mimeType }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
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

  // Helper function to detect file type from blob content
  const detectFileType = async (
    blob: Blob,
    blobId: string,
  ): Promise<{ filename: string; mimeType: string }> => {
    // Create filename with first 6 + last 6 characters of blob ID
    const shortId = `${blobId.substring(0, 6)}...${blobId.substring(blobId.length - 6)}`;

    // Read first few bytes to detect file signature (magic bytes)
    const arrayBuffer = await blob.slice(0, 20).arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to hex string for pattern matching
    const hex = Array.from(uint8Array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Common file signatures (magic bytes)
    const signatures = [
      { pattern: /^0061736d/, ext: 'wasm', mime: 'application/wasm' }, // WebAssembly files
      { pattern: /^ffd8ff/, ext: 'jpg', mime: 'image/jpeg' },
      { pattern: /^89504e47/, ext: 'png', mime: 'image/png' },
      { pattern: /^47494638/, ext: 'gif', mime: 'image/gif' },
      { pattern: /^52494646.{8}57454250/, ext: 'webp', mime: 'image/webp' },
      { pattern: /^25504446/, ext: 'pdf', mime: 'application/pdf' },
      { pattern: /^504b0304/, ext: 'zip', mime: 'application/zip' },
      { pattern: /^504b030414/, ext: 'zip', mime: 'application/zip' },
      { pattern: /^1f8b08/, ext: 'gz', mime: 'application/gzip' },
      { pattern: /^7f454c46/, ext: 'elf', mime: 'application/x-executable' },
      { pattern: /^cafebabe/, ext: 'class', mime: 'application/java-vm' },
      { pattern: /^feedface/, ext: 'macho', mime: 'application/x-mach-binary' },
      { pattern: /^4d5a/, ext: 'exe', mime: 'application/x-msdownload' },
      {
        pattern: /^377abcaf271c/,
        ext: '7z',
        mime: 'application/x-7z-compressed',
      },
      { pattern: /^425a68/, ext: 'bz2', mime: 'application/x-bzip2' },
      { pattern: /^1f9d/, ext: 'tar.z', mime: 'application/x-compress' },
      { pattern: /^1fa0/, ext: 'tar.z', mime: 'application/x-compress' },
      { pattern: /^526172211a0700/, ext: 'rar', mime: 'application/vnd.rar' },
      { pattern: /^526172211a070100/, ext: 'rar', mime: 'application/vnd.rar' },
    ];

    // Check for text-based files by looking for common patterns
    const textContent = new TextDecoder('utf-8', { fatal: false }).decode(
      uint8Array,
    );
    const isValidText = !textContent.includes('\ufffd'); // No replacement characters

    if (isValidText && uint8Array.length > 0) {
      // Check for specific text file patterns
      if (
        textContent.startsWith('<!DOCTYPE') ||
        textContent.startsWith('<html')
      ) {
        return { filename: `${shortId}.html`, mimeType: 'text/html' };
      }
      if (textContent.startsWith('{') || textContent.startsWith('[')) {
        return { filename: `${shortId}.json`, mimeType: 'application/json' };
      }
      if (
        textContent.includes('function') ||
        textContent.includes('const ') ||
        textContent.includes('var ')
      ) {
        return { filename: `${shortId}.js`, mimeType: 'text/javascript' };
      }
      // Default to text file
      return { filename: `${shortId}.txt`, mimeType: 'text/plain' };
    }

    // Check binary file signatures
    for (const { pattern, ext, mime } of signatures) {
      if (pattern.test(hex)) {
        return { filename: `${shortId}.${ext}`, mimeType: mime };
      }
    }

    // Default to binary file
    return { filename: `${shortId}.bin`, mimeType: 'application/octet-stream' };
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
          refreshBlobs={fetchBlobs}
        />
      </PageContentWrapper>
    </FlexLayout>
  );
}
