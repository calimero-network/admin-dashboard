import React, { useState } from 'react';
import {
  CheckIcon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export type ShowToast = (msg: string, type: 'success' | 'error') => void;

export function truncate(str: string, max = 24): string {
  return str.length > max ? `${str.slice(0, 10)}…${str.slice(-10)}` : str;
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function CopyBtn({ value, label }: { value: string; label?: string }) {
  return (
    <button
      className="ns-copy-btn"
      title={label ?? 'Copy'}
      aria-label={label ?? 'Copy'}
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(value);
      }}
    >
      <DocumentDuplicateIcon style={{ width: 12, height: 12 }} />
      {label}
    </button>
  );
}

/**
 * Two-step confirmation in place of a modal — the pattern the rest of the
 * dashboard already uses for destructive rows.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  busyLabel = 'Working…',
  busy,
  disabled,
  onConfirm,
  icon,
  title,
}: {
  label: string;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  icon?: React.ReactNode;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        className="btn btn-sm"
        onClick={() => setArmed(true)}
        disabled={disabled}
        title={title ?? label}
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <>
      <button
        className="btn btn-danger btn-sm"
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? busyLabel : confirmLabel}
      </button>
      <button
        className="btn btn-sm"
        onClick={() => setArmed(false)}
        disabled={busy}
      >
        Cancel
      </button>
    </>
  );
}

/**
 * Click-to-edit display name.
 *
 * Every named thing in a namespace (the namespace itself, subgroups, members,
 * contexts) carries the same `MetadataRecord.name`, so they all edit the same
 * way. `value` is the current name, if any.
 */
export function RenameField({
  value,
  placeholder,
  busy,
  onSave,
}: {
  value?: string | undefined;
  placeholder: string;
  busy?: boolean | undefined;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  if (!editing) {
    return (
      <button
        className="ns-rename-trigger"
        onClick={() => {
          setDraft(value ?? '');
          setEditing(true);
        }}
        title="Rename"
      >
        <PencilSquareIcon style={{ width: 12, height: 12 }} />
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    // Core rejects an empty name, so treat "cleared" as "cancel" rather than
    // sending a request that can only 400.
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  return (
    <span className="ns-rename-editor">
      <input
        className="ns-rename-input"
        autoFocus
        value={draft}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button
        className="ns-copy-btn"
        onClick={commit}
        disabled={busy}
        title="Save name"
        aria-label="Save name"
      >
        <CheckIcon style={{ width: 12, height: 12 }} />
      </button>
      <button
        className="ns-copy-btn"
        onClick={() => setEditing(false)}
        disabled={busy}
        title="Cancel rename"
        aria-label="Cancel rename"
      >
        <XMarkIcon style={{ width: 12, height: 12 }} />
      </button>
    </span>
  );
}
