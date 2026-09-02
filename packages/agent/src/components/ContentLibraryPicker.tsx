'use client';

import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import { FileText, ImageIcon, Search } from 'lucide-react';
import Image from 'next/image';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

export interface ContentLibraryPickerProps {
  isOpen: boolean;
  isLoading?: boolean;
  items?: readonly ContentMentionItem[];
  selectedIds?: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ContentMentionItem) => void;
}

const EMPTY_ITEMS: readonly ContentMentionItem[] = [];

function contentTypeIcon(contentType: string): ReactElement {
  const normalized = contentType.toLowerCase();
  if (
    normalized.includes('image') ||
    normalized.includes('photo') ||
    normalized.includes('visual')
  ) {
    return <ImageIcon aria-hidden="true" className="size-5" />;
  }
  return <FileText aria-hidden="true" className="size-5" />;
}

export function ContentLibraryPicker({
  isOpen,
  isLoading = false,
  items = EMPTY_ITEMS,
  selectedIds,
  onOpenChange,
  onSelect,
}: ContentLibraryPickerProps): ReactElement {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter(
      (item) =>
        item.contentTitle.toLowerCase().includes(normalizedQuery) ||
        item.contentType.toLowerCase().includes(normalizedQuery),
    );
  }, [items, query]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(80dvh,560px)] w-full max-w-lg flex-col gap-0 overflow-hidden border-border bg-popover p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Reference library content</DialogTitle>
          <DialogDescription>
            Pick posts or assets to attach as visual references in your message.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search library content"
              className="h-9 pl-9"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search by title or type…"
              value={query}
            />
          </div>
        </div>

        <div
          aria-busy={isLoading}
          className="min-h-0 flex-1 overflow-y-auto p-3"
          role="listbox"
          aria-label="Library content"
        >
          {isLoading ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Loading library…
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? 'No library content available yet.'
                : 'No matching content.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredItems.map((item) => {
                const isSelected = selectedIds?.has(item.id) ?? false;

                return (
                  <Button
                    key={item.id}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`Reference ${item.contentTitle}`}
                    isDisabled={isSelected}
                    onClick={() => {
                      onSelect(item);
                    }}
                    className={cn(
                      'group flex flex-col overflow-hidden rounded-lg border border-border bg-background-secondary text-left transition-colors',
                      isSelected
                        ? 'opacity-50'
                        : 'hover:border-primary/40 hover:bg-foreground/[0.04]',
                    )}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-background">
                      {item.thumbnailUrl ? (
                        <Image
                          src={item.thumbnailUrl}
                          alt=""
                          fill
                          sizes="160px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          {contentTypeIcon(item.contentType)}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
                      <span className="truncate text-xs font-medium text-foreground/90">
                        {item.contentTitle}
                      </span>
                      <span className="truncate text-2xs uppercase tracking-wide text-muted-foreground">
                        {item.contentType}
                      </span>
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
