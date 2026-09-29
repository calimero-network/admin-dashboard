import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { VersionInfo } from '../utils/registry';
import './VersionSelect.css';

/**
 * The version picker on an application page. Ported from the desktop
 * (tauri-app apps/desktop/src/components/VersionSelect.tsx) so both surfaces
 * show the same thing per version.
 *
 * ⚠️ NOT A NATIVE <select>, AND THAT IS THE POINT. A native `<option>` holds
 * plain text only, so it cannot carry the per-version node build as a quiet
 * secondary label, nor match the page's typography. This draws the list itself.
 *
 * What a native select gives away for free, and is therefore rebuilt here:
 *  - keyboard operation (Up/Down/Home/End to move, Enter/Space to choose,
 *    Escape to dismiss, Tab to leave) — focus stays on the trigger, which is a
 *    select-only `combobox` (ARIA 1.2) exposing the highlighted row through
 *    `aria-activedescendant`, the pattern for a popup that does not take focus,
 *  - `role="listbox"` / `role="option"` with `aria-selected`, so it is still
 *    announced as a picker rather than as a pile of buttons,
 *  - dismissal on an outside click.
 *
 * ⚠️ THE MENU IS PORTALLED AND POSITIONED `fixed` FROM THE TRIGGER'S RECT. Any
 * ancestor with `backdrop-filter`, `transform` or `overflow` would otherwise
 * contain or clip it — the trap the Lightbox documents too.
 *
 * Each option also names the core release it was built against (`node
 * 0.11.0-rc.54`): two releases of the same app can target different nodes, and
 * this is where the choice is made. Omitted, not placeholdered, when the bundle
 * does not say.
 */
export default function VersionSelect({
  id,
  versions,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  versions: VersionInfo[];
  value: string;
  onChange: (semver: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 190) });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // `true` — capture. A click that lands on something which stops
    // propagation would otherwise leave the menu open over the page.
    document.addEventListener('mousedown', close, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', close, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // Keep the keyboard-highlighted row in view in a list taller than the menu.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${baseId}-opt-${active}`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, baseId]);

  const openAt = () => {
    const i = versions.findIndex((v) => v.semver === value);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  };

  const choose = (i: number) => {
    const v = versions[i];
    if (v) onChange(v.semver);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp'
      ) {
        e.preventDefault();
        openAt();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, versions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(versions.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const selectedIndex = versions.findIndex((v) => v.semver === value);
  const label = value || versions[0]?.semver || '—';
  const selectedNodeBuild =
    versions[selectedIndex < 0 ? 0 : selectedIndex]?.nodeBuild ?? null;

  return (
    <div className="version-select">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`version-select-trigger${open ? ' is-open' : ''}`}
        data-testid="version-picker"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={`Version, ${label} selected${
          selectedNodeBuild ? `, built with node ${selectedNodeBuild}` : ''
        }`}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={onKeyDown}
      >
        <span className="version-select-value">{label}</span>
        {selectedNodeBuild && <NodeBuild value={selectedNodeBuild} />}
        {selectedIndex <= 0 && versions.length > 0 && (
          <span className="version-select-latest">latest</span>
        )}
        <ChevronDown
          size={14}
          className="version-select-chevron"
          aria-hidden="true"
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            className="version-select-menu"
            data-testid="version-picker-menu"
            role="listbox"
            tabIndex={-1}
            aria-label="Version"
            style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
            onKeyDown={onKeyDown}
          >
            {versions.map((v, i) => (
              <li
                key={v.semver}
                id={optionId(i)}
                role="option"
                aria-selected={v.semver === value}
                aria-label={`${v.semver}${i === 0 ? ', latest' : ''}${
                  v.nodeBuild ? `, built with node ${v.nodeBuild}` : ''
                }`}
                className={`version-select-option${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                // Keep focus on the trigger, which owns the keyboard handling.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span className="version-select-check">
                  {v.semver === value && <Check size={13} aria-hidden="true" />}
                </span>
                <span className="version-select-semver">{v.semver}</span>
                {v.nodeBuild && <NodeBuild value={v.nodeBuild} />}
                {i === 0 && (
                  <span className="version-select-latest">latest</span>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

function NodeBuild({ value }: { value: string }) {
  return (
    <span
      className="version-select-node"
      data-testid="version-node-build"
      title={`Built with Calimero node ${value}`}
    >
      node {value}
    </span>
  );
}
