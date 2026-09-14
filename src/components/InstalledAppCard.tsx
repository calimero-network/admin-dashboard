import React from 'react';
import { Copy, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
import AppIcon from './AppIcon';
import { formatBytes } from '../utils/appCards';
import {
  appDisplayName,
  appFrontendUrl,
  truncateId,
  type AppMetadata,
} from '../utils/appUtils';
import type { InstalledApplication } from '../utils/installedApps';
import './AppCard.css';
import './InstalledAppCard.css';

/**
 * One installed application, as a card.
 *
 * This was a five-column table of name, version, size, description and buttons.
 * The bundles it lists carry a launcher icon in their own metadata — the
 * desktop already passes that exact field to `create_desktop_shortcut` — so the
 * table was rendering a wall of near-identical text for apps that had pictures
 * available the whole time.
 *
 * ⚠️ NOT A <button> LIKE THE MARKETPLACE CARD. This one holds its own Open /
 * More controls, and nesting a button inside a button is invalid HTML that
 * browsers recover from by dropping the inner one — so the whole card would
 * have become one click target and Uninstall would have been unreachable.
 */
export default function InstalledAppCard({
  app,
  metadata,
  menuOpen,
  onToggleMenu,
  onContextMenu,
  onOpen,
}: {
  app: InstalledApplication;
  metadata: AppMetadata | null;
  menuOpen: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onOpen: (frontendUrl: string) => void;
}) {
  const name = appDisplayName(app, metadata);
  const frontendUrl = appFrontendUrl(metadata);
  const version = metadata?.version ?? app.version ?? null;
  const size = formatBytes(app.size);
  // The bundle's own package id when it has one; the node's application id is a
  // content hash and means nothing to a reader, so it is only the fallback.
  const subtitle = metadata?.package ?? truncateId(app.id);

  return (
    <div
      className="app-card installed-app-card"
      data-testid="installed-app-card"
      data-app-id={app.id}
      onContextMenu={onContextMenu}
    >
      <div className="app-card-top">
        <AppIcon
          icon={metadata?.icon}
          name={name}
          seed={metadata?.package ?? app.id}
          size={48}
        />
        <div className="app-card-headings">
          <h3 className="app-card-title" title={name}>
            {name}
          </h3>
          <p className="app-card-package">
            <span className="app-card-package-id" title={app.id}>
              {subtitle}
            </span>
          </p>
        </div>
      </div>

      <p className="app-card-description">
        {metadata?.description ?? 'No description available.'}
      </p>

      <div className="app-card-meta">
        {version && (
          <span className="app-card-meta-item">
            <span className="installed-app-version">v{version}</span>
          </span>
        )}
        {size && (
          <>
            <span aria-hidden="true" className="app-card-dot">
              ·
            </span>
            <span className="app-card-meta-item">{size}</span>
          </>
        )}
      </div>

      <div className="installed-app-actions">
        {frontendUrl ? (
          <button
            className="button button-secondary installed-app-open"
            data-testid="open-app"
            title={`Open ${name} in a new tab`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(frontendUrl);
            }}
          >
            Open
            <ExternalLink size={12} />
          </button>
        ) : (
          // An app with no declared frontend is a normal bundle, not a broken
          // one — the slot is held so the More button does not jump left.
          <span className="installed-app-no-frontend">No web frontend</span>
        )}

        {/* ⚠️ THE DROPDOWN IS NOT RENDERED HERE, and cannot be.
            `.app-card` carries `backdrop-filter`, which makes it a containing
            block for fixed-position descendants — so a `position: fixed` menu
            inside the card is laid out against the CARD and then clipped by its
            `overflow: hidden`. It opened, it just could not be seen or clicked.
            The page renders it as a sibling of the grid instead. */}
        <div
          className="installed-app-more"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="button installed-app-more-btn"
            title="More options"
            aria-label={`More options for ${name}`}
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The card's dropdown. Rendered by the page, positioned `fixed`. */
export function InstalledAppMenu({
  style,
  onCopyId,
  onUninstall,
}: {
  style: React.CSSProperties;
  onCopyId: () => void;
  onUninstall: () => void;
}) {
  return (
    /* ⚠️ NO role="menu" / role="menuitem" HERE. An explicit `menuitem` role
       REPLACES the implicit `button` one, so these stop being buttons to
       assistive tech and to getByRole — and real menu semantics would also
       oblige arrow-key navigation this does not implement. Plain buttons are
       both more honest and what the rest of the app uses. */
    <div className="app-actions-dropdown" style={style}>
      <button className="dropdown-item" onClick={onCopyId}>
        <Copy size={13} />
        Copy ID
      </button>
      <div className="dropdown-divider" />
      <button
        className="dropdown-item dropdown-item-danger"
        onClick={onUninstall}
      >
        <Trash2 size={13} />
        Uninstall
      </button>
    </div>
  );
}
