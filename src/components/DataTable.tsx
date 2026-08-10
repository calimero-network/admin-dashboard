import React, { useState, useMemo } from 'react';
import './DataTable.css';

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  sortValue?: (item: T) => string | number | null | undefined; // Extract sortable value (should match displayed value)
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Second argument is row index; use it when id fields may be empty so keys stay unique. */
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string | React.ReactNode;
  onRowClick?: (item: T) => void;
  compact?: boolean;
  onRowContextMenu?: (e: React.MouseEvent, item: T) => void;
}

export default function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No data available',
  onRowClick,
  compact = false,
  onRowContextMenu,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      // Toggle direction
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return data;
    }

    const column = columns.find((col) => col.key === sortColumn);
    if (!column || !column.sortable) {
      return data;
    }

    return [...data].sort((a, b) => {
      // Use sortValue function if provided (matches displayed value), otherwise use raw property
      const aValue = column.sortValue
        ? column.sortValue(a)
        : (a as any)[sortColumn];
      const bValue = column.sortValue
        ? column.sortValue(b)
        : (b as any)[sortColumn];

      // Handle null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, columns]);

  if (data.length === 0) {
    return <div className="data-table-empty">{emptyMessage}</div>;
  }

  return (
    <div
      className={`data-table-container ${compact ? 'data-table-compact' : ''}`}
    >
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column, colIndex) => (
              <th
                key={column.key || `col-${colIndex}`}
                className={column.sortable ? 'sortable' : ''}
                style={{ width: column.width }}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="th-content">
                  <span>{column.label}</span>
                  {column.sortable && (
                    <span className="sort-indicator">
                      {sortColumn === column.key
                        ? sortDirection === 'asc'
                          ? '↑'
                          : '↓'
                        : '⇅'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item, rowIndex) => {
            const rawKey = keyExtractor(item, rowIndex);
            const rowKey =
              rawKey != null && String(rawKey) !== ''
                ? String(rawKey)
                : `row-${rowIndex}`;
            return (
              <tr
                key={rowKey}
                onClick={() => onRowClick?.(item)}
                onContextMenu={(e) => onRowContextMenu?.(e, item)}
                className={onRowClick ? 'clickable' : ''}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={column.key || `col-${colIndex}`}
                    style={{ width: column.width }}
                  >
                    {column.render
                      ? column.render(item)
                      : String((item as any)[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
