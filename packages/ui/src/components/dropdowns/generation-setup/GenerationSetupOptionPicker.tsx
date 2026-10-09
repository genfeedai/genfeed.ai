'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupOptionPickerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import {
  GENERATION_SETUP_LOOK_PREVIEW_ATLAS,
  getGenerationSetupLookPreviewTile,
} from '@ui/constants/generation-setup-look-preview.constant';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  fieldControlClassName,
  fieldControlTriggerClassName,
} from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, ChevronsUpDown, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function GenerationSetupOptionPicker({
  isOpen: controlledOpen,
  onOpenChange,
  previewKind,
  label,
  onValueChange,
  options,
  value,
}: GenerationSetupOptionPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const [failedThumbnail, setFailedThumbnail] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(false);
  const isOpen = controlledOpen ?? internalOpen;
  function setIsOpen(open: boolean) {
    setInternalOpen(open);
    onOpenChange?.(open);
    if (!open) setHighlighted('');
  }
  const translate = useTranslations('agent.generationSetup');
  const selected = options.find((option) => option.value === value);
  const preview = previewKind
    ? options.find(
        (option) => `${option.label} ${option.value}` === highlighted,
      )
    : undefined;
  const previewTile = preview
    ? getGenerationSetupLookPreviewTile(
        previewKind,
        preview.value,
        preview.isPlatformDefault,
      )
    : undefined;
  const previewUrl =
    preview?.thumbnailUrl ??
    (previewTile !== undefined
      ? GENERATION_SETUP_LOOK_PREVIEW_ATLAS
      : undefined);
  const isAtlas = !preview?.thumbnailUrl && previewTile !== undefined;
  const hasPreviewImage = previewUrl && previewUrl !== failedThumbnail;
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          ariaLabel={label}
          aria-expanded={isOpen}
          role="combobox"
          className={`${fieldControlClassName} ${fieldControlTriggerClassName} ${SHELL_CONTROL_HEIGHT_CLASS} w-full justify-between gap-2 font-normal`}
          size={ButtonSize.SM}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span className="truncate">
            {selected?.label ?? (value || label)}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={previewKind ? 'start' : 'end'}
        side={previewKind ? 'left' : 'top'}
        avoidCollisions
        collisionPadding={16}
        sideOffset={8}
        onEscapeKeyDown={() => {
          restoreTriggerFocus.current = true;
        }}
        onCloseAutoFocus={(event) => {
          // A sibling opening must retain focus; restore only for selection/Escape.
          event.preventDefault();
          if (restoreTriggerFocus.current) triggerRef.current?.focus();
          restoreTriggerFocus.current = false;
        }}
        className={
          previewKind
            ? 'w-[min(480px,calc(100vw-2rem))] overflow-hidden p-0'
            : 'w-[min(240px,calc(100vw-2rem))] p-0'
        }
      >
        <Command
          value={highlighted}
          onValueChange={setHighlighted}
          label={translate('searchField', { field: label.toLowerCase() })}
          filter={(option, search) =>
            option.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            aria-label={translate('searchField', {
              field: label.toLowerCase(),
            })}
            placeholder={translate('searchFieldPlaceholder', {
              field: label.toLowerCase(),
            })}
          />
          <div className={previewKind ? 'grid min-h-0 grid-cols-2' : undefined}>
            <CommandList className="min-w-0 max-h-[min(256px,var(--radix-popover-content-available-height,50vh))]">
              <CommandEmpty>{translate('noMatches')}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    restoreTriggerFocus.current = true;
                    setIsOpen(false);
                    onValueChange(option.value);
                  }}
                  className="gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                  {option.isPlatformDefault ? (
                    <span className="text-2xs text-muted-foreground">
                      {translate('platformDefault')}
                    </span>
                  ) : null}
                  {option.value === value ? (
                    <Check className="size-3.5 shrink-0" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
            {previewKind ? (
              <div
                role="region"
                aria-label={translate('lookPreviewAria', { field: label })}
                className="min-w-0 space-y-2 border-l border-border p-3"
              >
                {preview ? (
                  <>
                    {hasPreviewImage ? (
                      <div className="relative aspect-square overflow-hidden rounded-md">
                        <Image
                          src={previewUrl}
                          width={isAtlas ? 400 : 216}
                          height={isAtlas ? 800 : 216}
                          unoptimized
                          alt={translate('lookPreviewImageAlt', {
                            label: preview.label,
                          })}
                          className={
                            isAtlas
                              ? 'absolute max-w-none'
                              : 'size-full object-cover'
                          }
                          style={
                            isAtlas
                              ? {
                                  width: '400%',
                                  height: '800%',
                                  left: `${-((previewTile ?? 0) % 4) * 100}%`,
                                  top: `${-Math.floor((previewTile ?? 0) / 4) * 100}%`,
                                }
                              : undefined
                          }
                          onError={() => setFailedThumbnail(previewUrl)}
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <ImageIcon className="size-8" aria-hidden="true" />
                      </div>
                    )}
                    <p className="text-xs font-medium">{preview.label}</p>
                    {preview.description ? (
                      <p className="text-xs text-muted-foreground">
                        {preview.description}
                      </p>
                    ) : null}
                    {!hasPreviewImage ? (
                      <p className="text-2xs text-muted-foreground">
                        {translate('lookPreviewUnavailable')}
                      </p>
                    ) : isAtlas ? (
                      <p className="text-2xs text-muted-foreground">
                        {translate('lookPreviewExample')}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {translate('lookPreviewHint')}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
