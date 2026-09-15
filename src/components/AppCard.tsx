import React from 'react';
import { BadgeCheck, CheckCircle2, Download } from 'lucide-react';
import AppIcon from './AppIcon';
import {
  formatBytes,
  formatCategory,
  formatRelativeDate,
  shortenKey,
} from '../utils/appCards';
import type { AppSummary } from '../utils/registry';
import './AppCard.css';

export interface AppCardApp extends AppSummary {
  installed?: boolean;
}

/**
 * The storefront card: icon, title, package id, description, author, date,
 * size, downloads, category.
 *
 * ⚠️ EVERY METADATA ROW IS CONDITIONAL, and that is load-bearing rather than
 * defensive. Measured against the live registry: `installSize` is null on 21 of
 * 21 bundles and `publishedAt` on 20 of 21, so a card that always rendered those
 * rows would print an empty or invented value on essentially every app. A card
 * carrying little more than a name is a legitimate outcome for an older bundle.
 *
 * No entrance animation on purpose: these render twenty at a time and a
 * staggered cascade on every filter keystroke is what makes a listing feel
 * unsettled.
 */
export default function AppCard({
  app,
  onOpen,
}: {
  app: AppCardApp;
  onOpen: (app: AppCardApp) => void;
}) {
  const title = app.alias ?? app.name;
  // ⚠️ `installSize ?? wasm.size`. The registry serves `installSize` as null on
  // all 21 published bundles and `wasm.size` on every one, so reading only the
  // first meant the size row never appeared on any card.
  const bytes = formatBytes(app.installSize ?? app.wasm?.size);
  const when = formatRelativeDate(app.publishedAt);
  const category = formatCategory(app.category);
  const author = app.author ?? shortenKey(app.developer_pubkey);
  // Which node release this bundle was built against, as the registry serves it
  // (`min_runtime_version`, in both spellings). `AppSummary` has carried this
  // for a while with a note that it was worth surfacing rather than storing —
  // this is that.
  //
  // ⚠️ `0.1.0` is the registry's PLACEHOLDER, applied to any bundle published
  // without one (`bundle-sanitize.js` defaults it), not a runtime anybody ran.
  // Printing it would put a confident wrong answer on most cards, so it reads
  // as absent — the same rule `installSize` and `publishedAt` already follow.
  const runtime =
    app.minRuntimeVersion && app.minRuntimeVersion !== '0.1.0'
      ? app.minRuntimeVersion
      : null;

  return (
    <button
      type="button"
      className="app-card"
      data-testid="app-card"
      // The package id, which the card renders but tests should not have to
      // read out of the DOM: the registry publishes distinct packages that share
      // a display name ("Mero Chat" is both com.calimero.chat and
      // com.calimero.curb), so picking a card by its title is non-deterministic.
      data-package={app.id}
      onClick={() => onOpen(app)}
    >
      <div className="app-card-top">
        <AppIcon icon={app.icon} name={title} seed={app.id} size={48} />

        <div className="app-card-headings">
          <h3 className="app-card-title" title={title}>
            {title}
          </h3>
          {/* The badge sits on the PACKAGE ID, because the registry's claim is
              about the package — a display name is a string anyone can pick,
              while `com.calimero.…` is the thing that actually gets installed. */}
          <p className="app-card-package">
            <span className="app-card-package-id">{app.id}</span>
            {app.verified && <VerifiedMark label="Verified package" />}
          </p>
        </div>
      </div>

      <p className="app-card-description">
        {app.description ?? 'No description available.'}
      </p>

      <div className="app-card-meta">
        {author && (
          <span className="app-card-meta-item app-card-author">
            <span className="app-card-author-name">{author}</span>
            {/* ⚠️ The AUTHOR's badge reads the PUBLISHER's field. Both marks
                reading `verified` would make one value assert two different
                things — a package's approval next to a person's name. */}
            {app.publisherVerified && <VerifiedMark label="Verified author" />}
          </span>
        )}
        {when && (
          <>
            <Dot />
            <span className="app-card-meta-item">{when}</span>
          </>
        )}
        {bytes && (
          <>
            <Dot />
            <span className="app-card-meta-item">{bytes}</span>
          </>
        )}
        <Dot />
        <span className="app-card-meta-item">
          <Download size={12} aria-hidden="true" />
          {(app.downloads ?? 0).toLocaleString()}
        </span>
        {runtime && (
          <>
            <Dot />
            <span
              className="app-card-meta-item"
              data-testid="app-card-runtime"
              // Core refuses to install a bundle whose floor is above the node
              // — "bundle requires runtime version 0.11.0-rc.28 but current
              // runtime is 0.11.0-rc.23" — and until now the only way to learn
              // that was to press Install and read the toast.
              title={`Built against node ${runtime}; a node older than this refuses to install it`}
            >
              node {runtime}
            </span>
          </>
        )}
      </div>

      {/* ⚠️ THE "INSTALLED" PILL SITS HERE, NOT NEXT TO THE TITLE. In the
          header row it competed with the name and the package id for a card
          that is ~300px wide at desktop width, and the result was
          "Blockchain D…" above "only-peers-c…" — both of the things a reader
          needs truncated, to make room for a badge. The footer row is short. */}
      <div className="app-card-footer">
        {category ? (
          <span className="app-card-category">{category}</span>
        ) : (
          <span />
        )}
        <span className="app-card-footer-right">
          {app.installed && (
            <span className="app-card-installed">
              <CheckCircle2 size={13} aria-hidden="true" />
              Installed
            </span>
          )}
          <span className="app-card-version">v{app.latest_version}</span>
        </span>
      </div>
    </button>
  );
}

/**
 * One mark, used everywhere a verified claim is made.
 *
 * `aria-label` says WHICH claim — "Verified package" next to the id, "Verified
 * author" next to the publisher. Two identical unlabelled ticks on one card is
 * two unexplained icons to a screen reader.
 */
export function VerifiedMark({ label }: { label: string }) {
  return (
    <BadgeCheck
      className="app-verified-mark"
      size={14}
      aria-label={label}
      role="img"
    />
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="app-card-dot">
      ·
    </span>
  );
}
