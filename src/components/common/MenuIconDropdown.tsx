import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/solid';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

const DropdownWrapper = styled.div`
  position: relative;
`;

const TriggerButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover,
  &:focus-visible {
    background: var(--accent-light);
    border-color: rgba(165, 255, 17, 0.28);
    color: var(--accent-primary);
    outline: none;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const MenuPanel = styled.div`
  width: 200px;
  max-width: calc(100vw - 16px);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 9999;
`;

const MenuItemButton = styled.button`
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover,
  &:focus-visible {
    background: var(--accent-light);
    color: var(--accent-primary);
    outline: none;
  }
`;

interface Option {
  title: string;
  onClick: () => void;
}

interface MenuIconDropdownProps {
  options: Option[];
}

export default function MenuIconDropdown({ options }: MenuIconDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = 200;
    const estimatedHeight = Math.max(56, options.length * 44 + 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldOpenUp =
      spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    const top = shouldOpenUp
      ? Math.max(8, rect.top - estimatedHeight - 8)
      : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 8);
    const left = Math.min(
      window.innerWidth - menuWidth - 8,
      Math.max(8, rect.right - menuWidth),
    );

    setPosition({ top, left });
  }, [options.length]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const menu = useMemo(() => {
    if (!isOpen) return null;

    return createPortal(
      <MenuPanel
        ref={menuRef}
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {options.map((option, id) => (
          <MenuItemButton
            type="button"
            key={id}
            onClick={() => {
              setIsOpen(false);
              option.onClick();
            }}
          >
            {option.title}
          </MenuItemButton>
        ))}
      </MenuPanel>,
      document.body,
    );
  }, [isOpen, options, position.left, position.top]);

  return (
    <DropdownWrapper>
      <TriggerButton
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePosition();
          }
          setIsOpen((open) => !open);
        }}
      >
        <EllipsisVerticalIcon />
      </TriggerButton>
      {menu}
    </DropdownWrapper>
  );
}
