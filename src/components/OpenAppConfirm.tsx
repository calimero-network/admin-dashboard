import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import './OpenAppConfirm.css';

export interface OpenAppConfirmProps {
  appName: string;
  packageId?: string | null | undefined;
  frontendUrl: string;
  onConfirm: (rememberOrigin: boolean) => void;
  onCancel: () => void;
}

export default function OpenAppConfirm({
  appName,
  packageId,
  frontendUrl,
  onConfirm,
  onCancel,
}: OpenAppConfirmProps) {
  const url = new URL(frontendUrl);
  const [remember, setRemember] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="open-app-confirm-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="open-app-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="open-app-confirm"
      >
        <span className="eyebrow">Open application</span>
        <h2 id={titleId} className="open-app-confirm-title">
          {appName}
        </h2>
        {packageId && <p className="open-app-confirm-package">{packageId}</p>}

        <div className="open-app-confirm-destination">
          <span className="open-app-confirm-label">Destination</span>
          <span
            className="open-app-confirm-host"
            data-testid="open-app-confirm-host"
          >
            {url.hostname}
          </span>
          <span
            className="open-app-confirm-origin"
            data-testid="open-app-confirm-origin"
          >
            {url.origin}
          </span>
        </div>

        <p id={descId} className="open-app-confirm-message">
          This site will receive a session for this node. For up to 24 hours it
          can run methods in your contexts, create and change namespaces and
          groups, invite members, and upload, read and delete blobs. Only
          continue if you trust <strong>{url.hostname}</strong>.
        </p>

        <label className="open-app-confirm-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            data-testid="open-app-confirm-remember"
          />
          Don&apos;t ask again for {appName} at {url.hostname}
        </label>

        <div className="open-app-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button"
            data-testid="open-app-confirm-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            data-testid="open-app-confirm-accept"
            onClick={() => onConfirm(remember)}
          >
            Open app
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
