'use client';

import { TagScope } from '@genfeedai/contracts';
import type { ITag, ITagColorSwatch } from '@genfeedai/contracts/interfaces';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import LibraryTagChip from './LibraryTagChip';
import TagColorPicker from './TagColorPicker';

/** How many of the targeted assets carry a tag. */
export type LibraryTagPickerState = 'all' | 'some';

export interface LibraryTagPickerProps {
  /** Disables selecting and creating while a write is in flight. */
  isBusy?: boolean;
  isLoading?: boolean;
  /** Create (or reuse) a tag with this label and color, and apply it. */
  onCreate: (label: string, color: ITagColorSwatch | undefined) => void;
  /** Toggle one tag on the targeted assets. */
  onToggle: (tag: ITag, state: LibraryTagPickerState | undefined) => void;
  /** Per tag id: carried by every targeted asset, or only some. */
  states?: ReadonlyMap<string, LibraryTagPickerState>;
  tags: readonly ITag[];
  /** The control that opens the picker. */
  trigger: ReactNode;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Pick, clear or create tags for the assets in hand. Used for one asset in the
 * inspector and for a whole selection in the bulk bar; `states` is the only
 * difference. The list is already scoped to the active brand plus
 * organization-wide tags, so there is nothing here to filter by brand.
 */
export default function LibraryTagPicker({
  isBusy = false,
  isLoading = false,
  onCreate,
  onToggle,
  states,
  tags,
  trigger,
}: LibraryTagPickerProps) {
  const translate = useTranslations('pages.library.tags');
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [color, setColor] = useState<ITagColorSwatch | undefined>();

  const trimmedQuery = query.trim();
  const hasExactMatch = useMemo(
    () =>
      tags.some(
        (tag) => normalizeLabel(tag.label) === normalizeLabel(trimmedQuery),
      ),
    [tags, trimmedQuery],
  );
  const canCreate = trimmedQuery.length > 0 && !hasExactMatch;

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setColor(undefined);
    }
  };

  const handleCreate = () => {
    if (!canCreate || isBusy) {
      return;
    }
    onCreate(trimmedQuery, color);
    setQuery('');
    setColor(undefined);
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={isOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverPanelContent className="w-72 p-0">
        <Command className="bg-transparent">
          <CommandInput
            aria-label={translate('searchLabel')}
            onValueChange={setQuery}
            placeholder={translate('searchPlaceholder')}
            value={query}
          />
          <CommandList>
            {isLoading ? (
              <div
                className="px-3 py-4 text-sm text-foreground/60"
                role="status"
              >
                {translate('loading')}
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {tags.length === 0
                    ? translate('emptyGuidance')
                    : translate('noMatch')}
                </CommandEmpty>
                {tags.length > 0 ? (
                  <CommandGroup>
                    {tags.map((tag) => {
                      const state = states?.get(tag.id);
                      return (
                        <CommandItem
                          disabled={isBusy}
                          key={tag.id}
                          keywords={[tag.label]}
                          onSelect={() => onToggle(tag, state)}
                          value={`${tag.label} ${tag.id}`}
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-4 shrink-0 items-center justify-center"
                          >
                            {state === 'all' ? (
                              <Check className="size-4" />
                            ) : state === 'some' ? (
                              <Minus className="size-4" />
                            ) : null}
                          </span>
                          <LibraryTagChip tag={tag} />
                          <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-foreground/50">
                            {tag.scope === TagScope.ORGANIZATION ? (
                              <span>{translate('scopeOrganization')}</span>
                            ) : null}
                            {tag.scope === TagScope.GLOBAL ? (
                              <span>{translate('scopeDefault')}</span>
                            ) : null}
                            {typeof tag.assetCount === 'number' ? (
                              <span>{tag.assetCount}</span>
                            ) : null}
                          </span>
                          {state ? (
                            <span className="sr-only">
                              {state === 'all'
                                ? translate('stateAll')
                                : translate('stateSome')}
                            </span>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null}
                {canCreate ? (
                  <CommandGroup>
                    <CommandItem
                      disabled={isBusy}
                      forceMount
                      onSelect={handleCreate}
                      value={`__create__ ${trimmedQuery}`}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      <span className="truncate">
                        {translate('create', { label: trimmedQuery })}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </>
            )}
          </CommandList>
          {tags.length > 0 ? (
            <p className="border-t border-border px-3 py-2 text-xs text-foreground/50">
              {translate('vocabularyHint')}
            </p>
          ) : null}
        </Command>
        {/* Outside `Command` on purpose: cmdk handles Enter and arrow keys for
            everything inside it, which would select an item instead of the
            focused swatch. */}
        {canCreate && !isLoading ? (
          <div className="border-t border-border px-3 py-2">
            <TagColorPicker
              onChange={setColor}
              value={color?.backgroundColor}
            />
          </div>
        ) : null}
      </PopoverPanelContent>
    </Popover>
  );
}
