import React, { useState } from 'react';
import { DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import type { InvitationPayload } from '../../api/namespaceApi';
import { decodeInvitation, encodeInvitation } from '../../utils/invitations';
import { copyToClipboard, errorMessage, type ShowToast } from './shared';

/**
 * Generate an invitation and show the code.
 *
 * The code is base64, the same encoding the desktop app uses, so a code made
 * here can be pasted there and vice versa.
 */
export function InvitePanel({
  title,
  hint,
  onCreate,
  onClose,
  showToast,
}: {
  title: string;
  hint: string;
  onCreate: () => Promise<InvitationPayload>;
  onClose: () => void;
  showToast: ShowToast;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      setCode(encodeInvitation(await onCreate()));
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to create invitation'), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="ns-panel" data-testid="ns-invite-panel">
      <div className="ns-panel-header">
        <h3>{title}</h3>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {!code ? (
        <>
          <p className="ns-muted">{hint}</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={create}
            disabled={creating}
          >
            {creating ? 'Generating…' : 'Generate invitation'}
          </button>
        </>
      ) : (
        <div className="ns-invitation-box">
          <div className="ns-invitation-header">
            <span>Share this code with the person you are inviting</span>
            <button
              className="ns-copy-btn"
              onClick={() => {
                copyToClipboard(code);
                showToast('Invitation copied', 'success');
              }}
            >
              <DocumentDuplicateIcon style={{ width: 13, height: 13 }} />
              Copy
            </button>
          </div>
          <textarea
            className="ns-invitation-textarea"
            readOnly
            value={code}
            rows={3}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      )}
    </div>
  );
}

/** Paste an invitation code to join a namespace, subgroup or context. */
export function JoinPanel({
  title,
  hint,
  confirmLabel,
  onJoin,
  onClose,
  showToast,
}: {
  title: string;
  hint: string;
  confirmLabel: string;
  onJoin: (payload: InvitationPayload) => Promise<void>;
  onClose: () => void;
  showToast: ShowToast;
}) {
  const [text, setText] = useState('');
  const [joining, setJoining] = useState(false);

  const join = async () => {
    setJoining(true);
    try {
      await onJoin(decodeInvitation(text));
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to join'), 'error');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="ns-panel" data-testid="ns-join-panel">
      <div className="ns-panel-header">
        <h3>{title}</h3>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="ns-muted">{hint}</p>
      <textarea
        className="ns-input"
        style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the invitation code…"
        aria-label="Invitation code"
      />
      <div className="ns-panel-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={join}
          disabled={joining || !text.trim()}
        >
          {joining ? 'Joining…' : confirmLabel}
        </button>
        <button className="btn btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
