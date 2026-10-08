'use client';

import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarReferenceSource } from '@genfeedai/props/prompt-bars/prompt-bar-reference-source.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { Link, Paperclip, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type ReactElement, useContext, useRef } from 'react';

export interface PromptBarReferenceControlsProps {
  accept?: string;
  className?: string;
  density?: 'compact' | 'default';
  isAttachmentDisabled?: boolean;
  isLibraryDisabled?: boolean;
  label?: string;
  onAddFiles?: (files: File[]) => void;
  onOpenLibrary?: () => void;
  /**
   * Several reference slots behind one `+` (Start frame, End frame, …). Each
   * slot gets its own Attach / Library submenu; overrides the single-slot props.
   */
  sources?: readonly PromptBarReferenceSource[];
}

/** Shared context menu for upload and Library references in every composer. */
export default function PromptBarReferenceControls({
  accept = 'image/*,video/*,audio/*',
  className,
  density = 'default',
  isAttachmentDisabled = false,
  isLibraryDisabled = false,
  label,
  onAddFiles,
  onOpenLibrary,
  sources,
}: PromptBarReferenceControlsProps): ReactElement | null {
  const translate = useTranslations('agent.composerToolbar');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSourceRef = useRef<PromptBarReferenceSource | null>(null);
  const context = useContext(PromptBarInternalContext);
  const selectedModels =
    context?.models.filter((model) =>
      context.normalizedWatchedModels.includes(model.key),
    ) ?? [];
  const controls =
    selectedModels.length === 1 && selectedModels[0]?.provider === 'crun'
      ? selectedModels[0].inputControls
      : undefined;
  if (
    controls?.mediaKind === 'video' &&
    controls.videoRules?.referenceMode === 'none'
  )
    return null;
  const controlSize = density === 'compact' ? 'size-8' : 'size-9';
  const menuLabel = label ?? translate('addContext');
  const menuSources: readonly PromptBarReferenceSource[] = sources ?? [
    {
      accept,
      id: 'default',
      isAttachmentDisabled,
      isLibraryDisabled,
      label: menuLabel,
      onAddFiles,
      onOpenLibrary: onOpenLibrary ?? (() => undefined),
    },
  ];
  const hasLibrary = sources !== undefined || onOpenLibrary !== undefined;
  const hasAttachments = menuSources.some((source) => source.onAddFiles);
  const isMenuDisabled = menuSources.every(
    (source) =>
      (source.onAddFiles ? source.isAttachmentDisabled : true) &&
      (!hasLibrary || source.isLibraryDisabled),
  );
  // Labelled triggers stay for single-slot callers; a multi-slot menu is the
  // bare `+` that opens the composer's add menu.
  const triggerLabel = sources ? undefined : label;

  if (menuSources.length === 0) {
    return null;
  }

  const handleAttach = (source: PromptBarReferenceSource): void => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }
    pendingSourceRef.current = source;
    input.accept = source.accept;
    input.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      pendingSourceRef.current?.onAddFiles?.(files);
    }
    pendingSourceRef.current = null;
    event.target.value = '';
  };

  const renderSourceItems = (source: PromptBarReferenceSource) => (
    <>
      {source.onAddFiles ? (
        <DropdownMenuItem
          disabled={source.isAttachmentDisabled}
          onSelect={() => handleAttach(source)}
        >
          <Paperclip className="mr-2 size-4" />
          {translate('attachFiles')}
        </DropdownMenuItem>
      ) : null}
      {hasLibrary ? (
        <DropdownMenuItem
          disabled={source.isLibraryDisabled}
          onSelect={source.onOpenLibrary}
        >
          <Link className="mr-2 size-4" />
          {translate('referenceLibrary')}
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <div className={cn('contents', className)}>
      {hasAttachments ? (
        <Input
          ref={fileInputRef}
          accept={menuSources[0]?.accept ?? accept}
          aria-hidden="true"
          className="sr-only"
          data-testid="composer-file-input"
          multiple
          onChange={handleFileChange}
          tabIndex={-1}
          type="file"
        />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ariaLabel={triggerLabel ?? translate('addContext')}
            className={cn(
              'shrink-0',
              triggerLabel ? 'h-8 gap-1.5 px-2' : controlSize,
            )}
            icon={
              <Plus className={density === 'compact' ? 'size-3.5' : 'size-4'} />
            }
            isDisabled={isMenuDisabled}
            size={triggerLabel ? ButtonSize.SM : ButtonSize.ICON}
            tooltip={triggerLabel ?? translate('addContext')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {triggerLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          avoidCollisions={false}
          className={cn(
            'w-56',
            'max-h-[min(560px,var(--radix-dropdown-menu-content-available-height,70vh))]',
            'overflow-y-auto overscroll-contain',
          )}
          side="top"
        >
          {menuSources.length === 1 ? (
            <>
              <DropdownMenuLabel>{menuSources[0].label}</DropdownMenuLabel>
              {renderSourceItems(menuSources[0])}
            </>
          ) : (
            <>
              <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
              {menuSources.map((source) => (
                <DropdownMenuSub key={source.id}>
                  <DropdownMenuSubTrigger
                    disabled={
                      (source.onAddFiles
                        ? source.isAttachmentDisabled
                        : true) && source.isLibraryDisabled
                    }
                  >
                    {source.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent collisionPadding={8}>
                    {renderSourceItems(source)}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
