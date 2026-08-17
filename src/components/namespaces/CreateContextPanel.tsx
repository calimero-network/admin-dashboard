import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  controlFor,
  defaultValueFor,
  describeInit,
  describeType,
  findInit,
  getApplicationAbi,
  unitVariantOptions,
  type AbiManifest,
  type AbiMethod,
  type AbiParameter,
} from '../../api/abi';
import { createContext as createContextApi } from '../../api/namespaceApi';
import { errorMessage, truncate, type ShowToast } from './shared';

export interface InstalledApp {
  id: string;
  name: string;
}

/**
 * Create a context, with the form generated from the application's ABI.
 *
 * Creating a context runs the app's `init`. Get its parameters wrong and the
 * call traps inside the WASM, and core answers a bare
 * `500 {"error":"Internal server error"}` with no indication of what was wrong
 * — it does not echo untyped internal errors, and in rc.20 even the node-side
 * log line came through empty. A free-text "initialization params (JSON,
 * optional)" box defaulting to `{}` therefore produced an unexplainable 500
 * for every app whose `init` takes arguments (mero-chat's takes five).
 *
 * So the params come from the ABI instead of from the user's memory. Apps with
 * no embedded ABI still get the raw JSON editor, and it is always available
 * behind "Edit as JSON" as an escape hatch.
 */
export function CreateContextPanel({
  groupId,
  defaultApplicationId,
  installedApps,
  onClose,
  onCreated,
  showToast,
}: {
  groupId: string;
  defaultApplicationId: string;
  installedApps: InstalledApp[];
  onClose: () => void;
  onCreated: () => void;
  showToast: ShowToast;
}) {
  const [appId, setAppId] = useState(defaultApplicationId);
  const [name, setName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [creating, setCreating] = useState(false);

  const [abi, setAbi] = useState<AbiManifest | null>(null);
  const [abiLoading, setAbiLoading] = useState(false);
  const [init, setInit] = useState<AbiMethod | null>(null);
  /** Per-param editor state, keyed by param name. Always strings. */
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState('{}');
  /** Set when the last attempt failed, so the panel can explain the 500. */
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAbiLoading(true);
    setLastError(null);
    getApplicationAbi(appId, serviceName.trim() || undefined)
      .then((manifest) => {
        if (cancelled) return;
        const initMethod = findInit(manifest);
        setAbi(manifest);
        setInit(initMethod);
        setRawMode(!initMethod);
        const seeded: Record<string, string> = {};
        for (const p of initMethod?.params ?? []) {
          const value = defaultValueFor(p.type, manifest?.types ?? {});
          seeded[p.name] =
            typeof value === 'string' ? value : JSON.stringify(value);
        }
        setValues(seeded);
        setRaw(initMethod ? '{}' : '{}');
      })
      .catch(() => {
        if (cancelled) return;
        // Treat an unreadable ABI exactly like an absent one.
        setAbi(null);
        setInit(null);
        setRawMode(true);
      })
      .finally(() => {
        if (!cancelled) setAbiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, serviceName]);

  // Memoised so `buildParams`' identity is stable across renders — an inline
  // `?? {}` is a fresh object each time.
  const types = useMemo(() => abi?.types ?? {}, [abi]);

  /**
   * Assemble the `init` payload. Throws with the offending field named, so a
   * bad value is reported here rather than as an opaque 500 from the node.
   */
  const buildParams = useCallback((): unknown => {
    if (rawMode || !init) {
      const text = raw.trim() || '{}';
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(
          `Initialization params are not valid JSON: ${(e as Error).message}`,
        );
      }
    }
    const payload: Record<string, unknown> = {};
    for (const p of init.params) {
      const rawValue = values[p.name] ?? '';
      const control = controlFor(p.type, types);
      if (control === 'text') {
        payload[p.name] = rawValue;
        continue;
      }
      if (control === 'enum') {
        payload[p.name] = rawValue;
        continue;
      }
      if (control === 'boolean') {
        payload[p.name] = rawValue === 'true';
        continue;
      }
      if (control === 'integer' || control === 'float') {
        if (rawValue.trim() === '') {
          if (p.nullable) {
            payload[p.name] = null;
            continue;
          }
          throw new Error(
            `"${p.name}" is required (${describeType(p.type, types)})`,
          );
        }
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) {
          throw new Error(`"${p.name}" must be a number`);
        }
        if (control === 'integer' && !Number.isInteger(numeric)) {
          throw new Error(`"${p.name}" must be a whole number`);
        }
        payload[p.name] = numeric;
        continue;
      }
      // json
      if (rawValue.trim() === '') {
        if (p.nullable) {
          payload[p.name] = null;
          continue;
        }
        throw new Error(
          `"${p.name}" is required (${describeType(p.type, types)})`,
        );
      }
      try {
        payload[p.name] = JSON.parse(rawValue);
      } catch (e) {
        throw new Error(
          `"${p.name}" is not valid JSON: ${(e as Error).message}`,
        );
      }
    }
    return payload;
  }, [init, raw, rawMode, types, values]);

  const create = async () => {
    setLastError(null);
    let params: unknown;
    try {
      params = buildParams();
    } catch (e: unknown) {
      const message = errorMessage(e, 'Invalid initialization params');
      setLastError(message);
      showToast(message, 'error');
      return;
    }

    setCreating(true);
    try {
      const result = await createContextApi({
        applicationId: appId.trim(),
        groupId,
        initializationParams: Array.from(
          new TextEncoder().encode(JSON.stringify(params)),
        ),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(serviceName.trim() ? { serviceName: serviceName.trim() } : {}),
      });
      showToast(`Context created: ${truncate(result.contextId)}`, 'success');
      onCreated();
      onClose();
    } catch (e: unknown) {
      const message = errorMessage(e, 'Failed to create context');
      setLastError(message);
      showToast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  /**
   * A 500 here is the node refusing to say why (see the file comment), so add
   * the context it withheld rather than leaving the user with
   * "Internal server error".
   */
  const explainError = (message: string): string | null => {
    if (!/^5\d\d/.test(message)) return null;
    if (init && init.params.length > 0) {
      return (
        `The node does not report why a context failed to initialize — it logs ` +
        `the detail server-side only. The usual cause is initialization params ` +
        `that ${describeInit(init, types)} rejects, so check the values above ` +
        `against their types; otherwise check the node's log.`
      );
    }
    return (
      `The node does not report why a context failed to initialize — it logs ` +
      `the detail server-side only. Check the node's log for the real error.`
    );
  };

  const renderField = (p: AbiParameter) => {
    const control = controlFor(p.type, types);
    const label = `${p.name}`;
    const hint = `${describeType(p.type, types)}${p.nullable ? ' · optional' : ''}`;
    const value = values[p.name] ?? '';
    const set = (next: string) =>
      setValues((prev) => ({ ...prev, [p.name]: next }));

    return (
      <label
        className="ns-form-field"
        key={p.name}
        data-testid={`ns-init-field-${p.name}`}
      >
        <span>
          <span className="ns-field-name">{label}</span>{' '}
          <span className="ns-field-type">{hint}</span>
        </span>
        {control === 'enum' ? (
          <select
            className="ns-input"
            value={value}
            onChange={(e) => set(e.target.value)}
          >
            {(unitVariantOptions(p.type, types) ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : control === 'boolean' ? (
          <select
            className="ns-input"
            value={value === 'true' ? 'true' : 'false'}
            onChange={(e) => set(e.target.value)}
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        ) : control === 'json' ? (
          <textarea
            className="ns-input"
            rows={2}
            style={{ resize: 'vertical', fontFamily: 'monospace' }}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        ) : (
          <input
            className="ns-input"
            type={control === 'text' ? 'text' : 'number'}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </label>
    );
  };

  return (
    <div className="ns-panel" data-testid="ns-create-context-panel">
      <div className="ns-panel-header">
        <h3>Create context</h3>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="ns-muted">
        A context is a running instance of the application, created inside this
        group.
      </p>

      <div className="ns-form">
        <label className="ns-form-field">
          <span>Application</span>
          <select
            className="ns-input"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          >
            {/* The group's own application may not be installed under a name we
                know; keep it selectable regardless. */}
            {!installedApps.some((a) => a.id === defaultApplicationId) && (
              <option value={defaultApplicationId}>
                {truncate(defaultApplicationId)} (this namespace)
              </option>
            )}
            {installedApps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name !== app.id
                  ? `${app.name} — ${app.id.slice(0, 12)}…`
                  : app.id}
              </option>
            ))}
          </select>
        </label>

        <label className="ns-form-field">
          <span>Name (optional)</span>
          <input
            className="ns-input"
            type="text"
            placeholder="e.g. general"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="ns-form-field">
          <span>Service (optional — multi-service bundles only)</span>
          <input
            className="ns-input"
            type="text"
            placeholder="Service name from the bundle"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
        </label>

        <div className="ns-init-block">
          <div className="ns-init-header">
            <span className="ns-init-title">
              Initialization
              {abiLoading && <span className="ns-muted"> · reading ABI…</span>}
            </span>
            {init && (
              <button
                type="button"
                className="ns-link-btn"
                onClick={() => setRawMode((v) => !v)}
              >
                {rawMode ? 'Use the ABI fields' : 'Edit as JSON'}
              </button>
            )}
          </div>

          {init && (
            <p className="ns-init-signature mono">
              {describeInit(init, types)}
            </p>
          )}
          {!abiLoading && !init && (
            <p className="ns-muted">
              This application publishes no ABI, so its <code>init</code>{' '}
              signature is unknown — supply the parameters as JSON.
            </p>
          )}

          {rawMode || !init ? (
            <textarea
              className="ns-input"
              rows={4}
              style={{ resize: 'vertical', fontFamily: 'monospace' }}
              placeholder='{"key": "value"}'
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-label="Initialization params JSON"
            />
          ) : init.params.length === 0 ? (
            <p className="ns-muted">
              <code>init</code> takes no parameters.
            </p>
          ) : (
            <div className="ns-form">{init.params.map(renderField)}</div>
          )}
        </div>
      </div>

      {lastError && explainError(lastError) && (
        <div className="alert alert-error ns-init-error">
          {explainError(lastError)}
        </div>
      )}

      <div className="ns-panel-actions">
        <button
          className="btn btn-primary"
          onClick={create}
          disabled={creating || !appId.trim()}
        >
          {creating ? 'Creating…' : 'Create Context'}
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
