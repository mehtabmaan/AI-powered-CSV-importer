import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  flex?: string; // Tailwind class like 'flex-[2]' or 'w-[150px]'
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  height?: string;
}

export function VirtualizedTable<T>({ data, columns, height = '400px' }: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // 48px row height estimation
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className="w-full overflow-auto rounded-xl border border-slate-800 bg-slate-900/20 glass"
      style={{ height }}
    >
      <div className="min-w-[800px]">
        {/* Table Header */}
        <div className="sticky top-0 z-10 flex bg-slate-950/95 py-3.5 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 backdrop-blur-md">
          {columns.map((col, idx) => (
            <div
              key={idx}
              className={`px-2 select-none truncate ${col.flex || 'flex-1'}`}
            >
              {col.header}
            </div>
          ))}
        </div>

        {/* Table Body */}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = data[virtualRow.index];
            if (!item) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full flex items-center py-2.5 px-4 hover:bg-slate-800/20 border-b border-slate-900/60 transition-colors duration-150"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((col, colIdx) => (
                  <div
                    key={colIdx}
                    className={`px-2 truncate text-sm text-slate-300 ${col.flex || 'flex-1'}`}
                  >
                    {col.accessor(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {data.length === 0 && (
        <div className="flex h-32 flex-col items-center justify-center text-slate-500 text-sm">
          No records present in this view
        </div>
      )}
    </div>
  );
}
