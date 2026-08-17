import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    let adjustX = 0;
    let adjustY = 0;
    if (x + rect.width > viewport.w - 8)
      adjustX = viewport.w - 8 - (x + rect.width);
    if (y + rect.height > viewport.h - 8)
      adjustY = viewport.h - 8 - (y + rect.height);
    if (x + adjustX < 8) adjustX = 8 - x;
    if (y + adjustY < 8) adjustY = 8 - y;
    if (adjustX || adjustY) {
      menuRef.current.style.left = `${x + adjustX}px`;
      menuRef.current.style.top = `${y + adjustY}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items
        .filter((item) => !item.disabled)
        .map((item, i) => (
          <button
            key={i}
            type="button"
            className={`context-menu-item ${item.danger ? 'context-menu-item-danger' : ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
    </div>
  );
}
