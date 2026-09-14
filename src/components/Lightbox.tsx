import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import './Lightbox.css';

export interface LightboxItem {
  id: string;
  /** The FULL-size image, deliberately not the thumbnail. */
  url: string;
  alt?: string | undefined;
}

/**
 * A preview image opened full screen.
 *
 * ⚠️ IT RENDERS IN A PORTAL, NOT IN PLACE, AND IT HAS TO. The preview strip is
 * a horizontally scrolling flex row (`overflow-x: auto`), which establishes a
 * scroll container — a `position: fixed; inset: 0` overlay rendered inside it
 * is clipped by that container, so "full screen" appears as a dark band inside
 * one tile. The same is true of the card grid's `backdrop-filter`, which makes
 * an ancestor a containing block for fixed descendants. Leaving the subtree
 * entirely is the only thing that reliably covers the viewport.
 *
 * Keyboard: Escape closes, Left/Right step. Focus moves into the dialog on open
 * so those keys reach it without the user clicking first, and returns to
 * whatever opened it on close — otherwise focus lands back at the top of the
 * document and a keyboard user has to tab through the whole page again.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  const step = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      // Wraps on purpose: at the last image, Right going nowhere reads as a
      // broken key rather than as the end of the set.
      const next = (index + delta + items.length) % items.length;
      onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // Stop the page behind from scrolling while the overlay is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      (restoreFocusTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const item = items[index];
  if (!item) return null;

  return createPortal(
    <div
      className="lightbox"
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={item.alt || 'Preview'}
      tabIndex={-1}
      ref={dialogRef}
      // Backdrop only: a click that started on the image itself must not close.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="lightbox-close"
        aria-label="Close preview"
        data-testid="lightbox-close"
        onClick={onClose}
      >
        <X size={18} />
      </button>

      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          aria-label="Previous image"
          data-testid="lightbox-prev"
          onClick={() => step(-1)}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <img
        className="lightbox-image"
        src={item.url}
        alt={item.alt || ''}
        data-testid="lightbox-image"
      />

      {items.length > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          aria-label="Next image"
          data-testid="lightbox-next"
          onClick={() => step(1)}
        >
          <ChevronRight size={22} />
        </button>
      )}

      <div className="lightbox-caption">
        {item.alt && <span className="lightbox-alt">{item.alt}</span>}
        {items.length > 1 && (
          <span className="lightbox-count">
            {index + 1} / {items.length}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
