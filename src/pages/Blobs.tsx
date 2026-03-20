import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  CubeTransparentIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  getAppEndpointKey,
  getAccessToken,
} from '@calimero-network/calimero-client';
import { Navigation } from '../components/Navigation';
import './Blobs.css';

interface BlobInfo {
  blobId: string;
  size: number;
  fileType?: string;
  isDetecting?: boolean;
}

type Toast = {
  type: 'success' | 'error';
  msg: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function truncateMiddle(value: string, start = 12, end = 8): string {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatFileType(type?: string, isDetecting?: boolean): string {
  if (isDetecting) return 'Detecting...';
  if (!type || type === 'unknown') return 'Unknown';
  return type;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getAppEndpointKey();
  if (!base) throw new Error('Node URL not configured');
  const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...((init?.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res;
}

export default function BlobsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [blobs, setBlobs] = useState<BlobInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyBlobId, setBusyBlobId] = useState<string | null>(null);

  const showToast = useCallback((msg: string, type: Toast['type']) => {
    setToast({ msg, type });
    window.setTimeout(() => {
      setToast((current) => (current?.msg === msg ? null : current));
    }, 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('admin-api/blobs');
      const json = await res.json();
      const rawBlobs: Array<{ blob_id: string; size: number }> =
        json?.data?.blobs ?? json?.blobs ?? [];
      setBlobs(rawBlobs.map((b) => ({ blobId: b.blob_id, size: b.size })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch blobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUploadClick = () => {
    if (isUploading) return;
    inputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadFileName(file.name);
    setError('');

    try {
      const base = getAppEndpointKey();
      if (!base) throw new Error('Node URL not configured');
      const url = `${base.replace(/\/+$/, '')}/admin-api/blobs`;

      const uploadedBlobId = await new Promise<string | null>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);
          const token = getAccessToken();
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setUploadProgress((e.loaded / e.total) * 100);
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const json = JSON.parse(xhr.responseText);
                resolve(json?.data?.blob_id ?? json?.blob_id ?? null);
              } catch {
                resolve(null);
              }
            } else {
              reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(file);
        },
      );

      showToast(
        uploadedBlobId
          ? `Uploaded "${file.name}". Blob ID: ${uploadedBlobId}`
          : `Uploaded "${file.name}" successfully.`,
        'success',
      );
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadFileName('');
    }
  };

  const handleDownload = async (blobId: string) => {
    setBusyBlobId(blobId);
    setError('');
    try {
      const res = await apiFetch(`admin-api/blobs/${blobId}`);
      const contentType =
        res.headers.get('content-type') || 'application/octet-stream';
      const arrayBuffer = await res.arrayBuffer();
      const url = window.URL.createObjectURL(
        new Blob([arrayBuffer], { type: contentType }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = blobId;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    } finally {
      setBusyBlobId(null);
    }
  };

  const handleDelete = async (blobId: string) => {
    setBusyBlobId(blobId);
    setError('');
    try {
      await apiFetch(`admin-api/blobs/${blobId}`, { method: 'DELETE' });
      showToast('Blob deleted', 'success');
      setConfirmId(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setBusyBlobId(null);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Blob ID copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy Blob ID', 'error');
    }
  };

  const totalStorage = useMemo(
    () => blobs.reduce((sum, blob) => sum + blob.size, 0),
    [blobs],
  );

  return (
    <div className="app-shell">
      <Navigation />
      <main className="page-content">
        <div className="page-header">
          <div className="page-header-left">
            <h1>Blobs</h1>
            <p>
              Browse, download, upload, and delete blobs stored on this node
            </p>
          </div>
          <div className="blobs-header-actions">
            <button
              className="btn"
              onClick={() => void load()}
              disabled={loading}
            >
              <ArrowPathIcon
                style={{ width: 16, height: 16 }}
                className={loading ? 'spin' : ''}
              />
              Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              <CloudArrowUpIcon style={{ width: 16, height: 16 }} />
              {isUploading ? 'Uploading...' : 'Upload Blob'}
            </button>
            <input
              ref={inputRef}
              type="file"
              className="blobs-file-input"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {toast && (
          <div className={`alert alert-${toast.type}`}>{toast.msg}</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="blobs-stats">
          <div className="card blobs-stat-card">
            <span className="blobs-stat-label">Total blobs</span>
            <strong className="blobs-stat-value">{blobs.length}</strong>
          </div>
          <div className="card blobs-stat-card">
            <span className="blobs-stat-label">Total storage</span>
            <strong className="blobs-stat-value">
              {formatFileSize(totalStorage)}
            </strong>
          </div>
        </div>

        {isUploading && (
          <div className="card blobs-upload-card">
            <div className="blobs-upload-header">
              <div>
                <h3>Uploading blob</h3>
                <p>{uploadFileName}</p>
              </div>
              <span className="blobs-upload-percent">
                {uploadProgress > 0
                  ? `${uploadProgress.toFixed(0)}%`
                  : 'In progress'}
              </span>
            </div>
            <div className="blobs-progress-track">
              <div
                className={`blobs-progress-bar ${
                  uploadProgress === 0 ? 'blobs-progress-indeterminate' : ''
                }`}
                style={{
                  width: uploadProgress > 0 ? `${uploadProgress}%` : '35%',
                }}
              />
            </div>
          </div>
        )}

        {loading && blobs.length === 0 ? (
          <div className="blobs-list">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="blob-row blob-row-skeleton">
                <div className="skel-line skel-title" />
                <div className="skel-line skel-short" />
              </div>
            ))}
          </div>
        ) : blobs.length === 0 ? (
          <div className="empty-state">
            <CubeTransparentIcon />
            <h3>No blobs found</h3>
            <p>
              Upload a file to store it on the node and manage it from here.
            </p>
          </div>
        ) : (
          <div className="card blobs-table-card">
            <div className="blobs-table-head">
              <div>Blob ID</div>
              <div>Size</div>
              <div>Type</div>
              <div className="blobs-table-actions-head">Actions</div>
            </div>

            <div className="blobs-list">
              {blobs.map((blob) => (
                <div key={blob.blobId} className="blob-row">
                  <div className="blob-cell blob-id-cell">
                    <button
                      className="blob-copy-btn"
                      onClick={() => void handleCopy(blob.blobId)}
                      title="Copy blob ID"
                    >
                      <ClipboardDocumentIcon
                        style={{ width: 15, height: 15 }}
                      />
                    </button>
                    <span title={blob.blobId}>
                      {truncateMiddle(blob.blobId, 16, 10)}
                    </span>
                  </div>

                  <div className="blob-cell blob-muted">
                    {formatFileSize(blob.size)}
                  </div>
                  <div className="blob-cell blob-type">
                    {formatFileType(blob.fileType, blob.isDetecting)}
                  </div>

                  <div className="blob-actions">
                    {confirmId === blob.blobId ? (
                      <>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleDelete(blob.blobId)}
                          disabled={busyBlobId === blob.blobId}
                        >
                          {busyBlobId === blob.blobId
                            ? 'Deleting...'
                            : 'Confirm'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmId(null)}
                          disabled={busyBlobId === blob.blobId}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-sm"
                          onClick={() => void handleDownload(blob.blobId)}
                          disabled={busyBlobId === blob.blobId}
                        >
                          <ArrowDownTrayIcon
                            style={{ width: 14, height: 14 }}
                          />
                          {busyBlobId === blob.blobId
                            ? 'Working...'
                            : 'Download'}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setConfirmId(blob.blobId)}
                          disabled={busyBlobId === blob.blobId}
                        >
                          <TrashIcon style={{ width: 14, height: 14 }} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
