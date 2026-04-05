'use client';

import type { IPrompt } from '@genfeedai/types';
import { BookMarked, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { usePromptLibraryStore } from '@/store/promptLibraryStore';

interface PromptPickerProps {
  onSelect: (item: IPrompt) => void;
  label?: string;
}

function PromptPickerComponent({ onSelect, label }: PromptPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { items, featuredItems, isLoading, loadItems, loadFeatured, recordItemUsage } =
    usePromptLibraryStore();

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        left: rect.left,
        top: rect.bottom + 4,
      });
    }
  }, [isOpen]);

  // Load items when dropdown opens
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();

    Promise.all([
      loadItems({ limit: 10 }, controller.signal),
      loadFeatured(controller.signal),
    ]).catch((error) => {
      // Ignore abort errors - they're expected when component unmounts
      if (error?.name !== 'AbortError') {
        // Silently handle other errors - store already handles error state
      }
    });

    return () => controller.abort();
  }, [isOpen, loadItems, loadFeatured]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    async (item: IPrompt) => {
      await recordItemUsage(item._id);
      onSelect(item);
      setIsOpen(false);
    },
    [recordItemUsage, onSelect]
  );

  // Combine recent and featured, remove duplicates
  const displayItems = [
    ...items.slice(0, 5),
    ...featuredItems.filter((f) => !items.some((i) => i._id === f._id)),
  ].slice(0, 8);

  return (
    <>
      {label ? (
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-1 items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition"
        >
          <span className="truncate">{label}</span>
          {isOpen ? (
            <ChevronUp className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )}
        </button>
      ) : (
        <Button
          ref={buttonRef}
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          title="Load from library"
          className="gap-1 px-2"
        >
          <BookMarked className="h-3.5 w-3.5" />
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      )}

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[100] w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            style={{ left: dropdownPosition.left, top: dropdownPosition.top }}
          >
            {/* Header */}
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Load from Library
            </div>

            {/* Content */}
            <div className="max-h-64 overflow-auto">
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : displayItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No saved prompts yet
                </div>
              ) : (
                <div className="py-1">
                  {displayItems.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => handleSelect(item)}
                      className="w-full px-3 py-2 text-left transition hover:bg-secondary"
                    >
                      <div className="flex items-start gap-2">
                        {item.thumbnail ? (
                          <Image
                            src={item.thumbnail}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 shrink-0 rounded object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary">
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{item.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.promptText}
                          </div>
                        </div>
                        {item.isFeatured && (
                          <span className="shrink-0 rounded bg-chart-3/10 px-1 py-0.5 text-[9px] text-chart-3">
                            Featured
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Marketplace Footer */}
            <div className="border-t border-border">
              <a
                href="https://marketplace.genfeed.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <span>Browse Marketplace</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export const PromptPicker = memo(PromptPickerComponent);
