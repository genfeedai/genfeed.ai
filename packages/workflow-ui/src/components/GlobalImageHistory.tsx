'use client';

import { Clock3, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImageHistoryItem } from '../stores/workflow/types';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';

const EMPTY_HISTORY: ImageHistoryItem[] = [];

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function calculateFanPosition(index: number, _total: number) {
  const verticalSpacing = 60;
  const curveStrength = 0.15;
  const xOffset = index * index * curveStrength;

  const x = -28 + xOffset;
  const y = -(index * verticalSpacing + 56);

  return { x, y };
}

function FanItem({
  item,
  index,
  total,
  onDragStart,
}: {
  item: ImageHistoryItem;
  index: number;
  total: number;
  onDragStart: (e: React.DragEvent, item: ImageHistoryItem) => void;
}) {
  const { x, y } = calculateFanPosition(index, total);
  const delay = index * 30;

  return (
    <Button
      variant="ghost"
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className="absolute w-14 h-14 overflow-hidden border-2 border-neutral-600 hover:border-blue-500 shadow-lg cursor-grab active:cursor-grabbing transition-colors duration-150 animate-fan-enter group p-0"
      style={
        {
          '--fan-x': `${x}px`,
          '--fan-y': `${y}px`,
          animationDelay: `${delay}ms`,
          zIndex: 10 - index,
        } as React.CSSProperties
      }
      title={`${formatRelativeTime(item.timestamp)}\n${item.prompt?.substring(0, 50) || ''}...`}
    >
      <Image
        src={item.image}
        alt={`History ${index + 1}`}
        fill
        unoptimized
        sizes="56px"
        className="object-cover pointer-events-none"
      />
    </Button>
  );
}

function HistorySidebar({
  history,
  onClear,
  onClose,
  onDragStart,
  triggerRect,
}: {
  history: ImageHistoryItem[];
  onClear: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent, item: ImageHistoryItem) => void;
  triggerRect: DOMRect | null;
}) {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sidebarStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 200,
  };

  if (triggerRect) {
    const left = Math.max(16, triggerRect.left - 140);
    const bottom = window.innerHeight - triggerRect.top + 8;
    sidebarStyle.left = `${left}px`;
    sidebarStyle.bottom = `${bottom}px`;
  } else {
    sidebarStyle.right = '100px';
    sidebarStyle.bottom = '100px';
  }

  return createPortal(
    <div
      ref={sidebarRef}
      className="w-80 max-h-[420px] bg-neutral-800 border border-neutral-600 shadow-xl flex flex-col"
      style={sidebarStyle}
    >
      <div className="px-4 py-3 border-b border-neutral-700 flex items-center justify-between shrink-0">
        <span className="text-sm text-neutral-200 font-medium">
          All History ({history.length})
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-[10px] text-neutral-500 hover:text-red-400 p-0 h-auto"
            title="Clear all history"
          >
            Clear All
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="w-5 h-5 text-neutral-400 hover:bg-neutral-700 hover:text-white"
            title="Close"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {history.map((item, index) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            className="flex h-auto w-full justify-start gap-3 p-2 hover:bg-neutral-700/50 cursor-grab active:cursor-grabbing group transition-colors"
          >
            <div className="relative w-14 h-14 rounded overflow-hidden shrink-0 border border-neutral-600 group-hover:border-blue-500 transition-colors">
              <Image
                src={item.image}
                alt={`History ${index + 1}`}
                fill
                unoptimized
                sizes="56px"
                className="object-cover pointer-events-none"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-[11px] text-neutral-300 truncate">
                {item.prompt?.substring(0, 60) || 'No prompt'}
              </p>
              <p className="text-[10px] text-neutral-500 mt-0.5">
                {formatRelativeTime(item.timestamp)}
                {item.model ? ` · ${item.model}` : ''}
              </p>
            </div>
          </Button>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-neutral-700 bg-neutral-900/50 shrink-0">
        <span className="text-[10px] text-neutral-500">
          Drag images to canvas to create nodes
        </span>
      </div>
    </div>,
    document.body,
  );
}

export function GlobalImageHistory() {
  const [isOpen, setIsOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const history = useWorkflowStore(
    (state) => state.globalImageHistory ?? EMPTY_HISTORY,
  );
  const clearGlobalHistory = useWorkflowStore(
    (state) => state.clearGlobalHistory,
  );

  const fanItems = history.slice(0, 10);
  const hasOverflow = history.length > 10;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen && !showSidebar) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, showSidebar]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSidebar) {
          setShowSidebar(false);
        } else {
          setIsOpen(false);
        }
      }
    };
    if (isOpen || showSidebar) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showSidebar]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: ImageHistoryItem) => {
      e.dataTransfer.setData(
        'application/history-image',
        JSON.stringify({
          image: item.image,
          prompt: item.prompt,
          timestamp: item.timestamp,
        }),
      );
      e.dataTransfer.effectAllowed = 'copy';

      // Defer state change to prevent unmounting mid-drag
      setTimeout(() => {
        setIsOpen(false);
        setShowSidebar(false);
      }, 0);
    },
    [],
  );

  const handleShowAll = useCallback(() => {
    setIsOpen(false);
    setShowSidebar(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setShowSidebar(false);
  }, []);

  const handleClear = useCallback(() => {
    clearGlobalHistory();
    setIsOpen(false);
    setShowSidebar(false);
  }, [clearGlobalHistory]);

  if (history.length === 0) return null;

  return (
    <div ref={drawerRef} className="absolute bottom-4 right-64 z-10">
      <Button
        ref={triggerRef}
        variant="outline"
        size="icon-sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-400 hover:text-white shadow-lg"
        title={`${history.length} image${history.length > 1 ? 's' : ''} in history`}
      >
        <Clock3 className="w-4 h-4" />
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
          {history.length > 99 ? '99+' : history.length}
        </span>
      </Button>

      {isOpen && (
        <div
          className="absolute bottom-full right-1/2 translate-x-1/2 mb-2"
          style={{ zIndex: 100 }}
        >
          <div className="relative w-0 h-0">
            {fanItems.map((item, index) => (
              <FanItem
                key={item.id}
                item={item}
                index={index}
                total={fanItems.length}
                onDragStart={handleDragStart}
              />
            ))}
          </div>

          {hasOverflow &&
            (() => {
              const topItemPos = calculateFanPosition(
                fanItems.length - 1,
                fanItems.length,
              );
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowAll}
                  className="absolute animate-fan-enter bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-[10px] text-neutral-300 hover:text-white shadow-lg whitespace-nowrap px-2 py-1 h-auto"
                  style={
                    {
                      '--fan-x': `${topItemPos.x}px`,
                      '--fan-y': `${topItemPos.y - 60}px`,
                      animationDelay: `${fanItems.length * 30}ms`,
                    } as React.CSSProperties
                  }
                >
                  +{history.length - 10} more
                </Button>
              );
            })()}
        </div>
      )}

      {showSidebar && (
        <HistorySidebar
          history={history}
          onClear={handleClear}
          onClose={handleCloseSidebar}
          onDragStart={handleDragStart}
          triggerRect={triggerRef.current?.getBoundingClientRect() || null}
        />
      )}
    </div>
  );
}
