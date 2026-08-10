import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import './ScrollHint.css';

interface ScrollHintProps {
  /** The scrollable container - pass a ref from parent */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Optional additional class for the hint */
  className?: string;
}

/**
 * Shows "Scroll for more ↓" when content overflows and user hasn't scrolled to bottom.
 * Hides when user scrolls near the bottom. Place inside the scroll container.
 */
export function ScrollHint({ containerRef, className = '' }: ScrollHintProps) {
  const [showHint, setShowHint] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = containerRef?.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    setShowHint(hasOverflow && !nearBottom);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    checkOverflow();
    el.addEventListener('scroll', checkOverflow);
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', checkOverflow);
      resizeObserver.disconnect();
    };
  }, [containerRef, checkOverflow]);

  return showHint ? (
    <div className={`scroll-hint ${className}`} aria-hidden>
      <ChevronDown size={20} />
      <span>Scroll for more</span>
    </div>
  ) : null;
}
