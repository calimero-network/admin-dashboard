import React, { useState } from 'react';
import { fallbackHue } from '../utils/appCards';
import './AppIcon.css';

/**
 * An app's launcher icon, or a deterministic stand-in.
 *
 * The icon is `metadata.icon` — a `data:image/png;base64,…` URI carried inside
 * the signed bundle. This is not new data: the desktop already hands the very
 * same field to `create_desktop_shortcut` when it writes a launcher, so it was
 * being used for the dock and thrown away for the UI.
 *
 * ⚠️ THE FALLBACK IS A NORMAL STATE, NOT AN ERROR STATE. Three of the 21
 * published bundles carry no icon, so a broken-image glyph would tell the user
 * "this app is broken" when the truth is "this app has no icon".
 *
 * ⚠️ THE LETTER IS A FIXED NEAR-WHITE, NOT A THEME TOKEN — and that is
 * deliberate. app-registry's version of this component paints the letter in
 * `text-ink/80`, a token that flips to near-BLACK in light mode while the tile
 * behind it stays dark either way. Measured across hues that lands at
 * 1.37–2.06:1 on paper: the letter all but disappears. The tile is dark in both
 * themes, so the ink on it has to be too. (Worth fixing upstream as well.)
 *
 * `width`/`height` are set explicitly and decoding is async: a listing inlines
 * twenty base64 PNGs, and without intrinsic sizing every one of them reflows the
 * grid as it decodes.
 */
export default function AppIcon({
  icon,
  name,
  seed,
  size = 48,
  className = '',
}: {
  icon?: string | undefined;
  name?: string | null | undefined;
  seed: string;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const radius = size >= 64 ? 16 : size >= 40 ? 12 : 9;

  if (icon && !failed) {
    return (
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`app-icon-img ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  const hue = fallbackHue(seed);
  const letter = ((name ?? seed).trim()[0] ?? '?').toUpperCase();

  return (
    <div
      aria-hidden="true"
      data-testid="app-icon-fallback"
      className={`app-icon-fallback ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(140deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 45% 20%))`,
      }}
    >
      {letter}
    </div>
  );
}
