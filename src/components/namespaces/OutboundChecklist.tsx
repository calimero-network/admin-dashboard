import React from 'react';

/**
 * The app's declared outbound URL prefixes as a checklist, for the confirm an
 * admin already clicks when installing an app into a namespace.
 *
 * Every prefix starts checked: the publisher declared them in a signed
 * manifest, and the common case is approving the app as published. What is
 * left unchecked is still recorded as reviewed, so its requests answer
 * `NotApproved` until an admin approves it from the namespace page.
 *
 * Renders nothing for an app that declares no prefixes.
 */
export function OutboundChecklist({
  declared,
  checked,
  onChange,
  disabled,
}: {
  declared: string[];
  checked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  if (declared.length === 0) return null;

  const toggle = (prefix: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(prefix);
    else next.delete(prefix);
    onChange(next);
  };

  const unchecked = declared.filter((p) => !checked.has(p)).length;

  return (
    <div className="ns-form-field" data-testid="ns-outbound-checklist">
      <span>This app sends requests to:</span>
      <div className="ns-outbound-list">
        {declared.map((prefix) => (
          <label key={prefix} className="ns-outbound-item">
            <input
              type="checkbox"
              checked={checked.has(prefix)}
              disabled={disabled}
              onChange={(e) => toggle(prefix, e.target.checked)}
              aria-label={`Approve requests to ${prefix}`}
            />
            <span className="mono">{prefix}</span>
          </label>
        ))}
      </div>
      <p className="ns-muted ns-outbound-hint">
        Checked prefixes are approved for this app&apos;s publisher in the new
        namespace. Requests under an unchecked prefix are refused until an admin
        approves it under <strong>Outbound access</strong> on the namespace
        page. A node still sends a request only if its operator allows the host.
        {unchecked > 0 && (
          <>
            {' '}
            <span data-testid="ns-outbound-unchecked">
              {unchecked === 1
                ? '1 prefix will be refused.'
                : `${unchecked} prefixes will be refused.`}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
