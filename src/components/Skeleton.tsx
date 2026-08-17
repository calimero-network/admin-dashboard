import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export default function Skeleton({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'rectangular',
  animation = 'pulse',
}: SkeletonProps) {
  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '1rem'),
    borderRadius:
      borderRadius ||
      (variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '4px'),
  };

  return (
    <div
      className={`skeleton skeleton-${variant} skeleton-${animation} ${className}`}
      style={style}
      aria-label="Loading..."
      aria-busy="true"
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  width?: string | number;
  lastLineWidth?: string | number;
  className?: string;
}

export function SkeletonText({
  lines = 3,
  width = '100%',
  lastLineWidth = '60%',
  className = '',
}: SkeletonTextProps) {
  return (
    <div className={`skeleton-text ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === lines - 1 ? lastLineWidth : width}
          className="skeleton-line"
        />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showHeader = true,
}: SkeletonTableProps) {
  return (
    <div className="skeleton-table-container">
      <table className="skeleton-table">
        {showHeader && (
          <thead>
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index}>
                  <Skeleton variant="text" width="80%" height="14px" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex}>
                  {colIndex === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <Skeleton variant="text" width="70%" height="14px" />
                      <Skeleton variant="text" width="50%" height="12px" />
                    </div>
                  ) : colIndex === columns - 1 ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Skeleton
                        variant="rectangular"
                        width="60px"
                        height="28px"
                      />
                      <Skeleton
                        variant="rectangular"
                        width="70px"
                        height="28px"
                      />
                    </div>
                  ) : (
                    <Skeleton
                      variant="text"
                      width={colIndex % 2 === 0 ? '90%' : '60%'}
                      height="14px"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
