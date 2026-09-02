'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Input } from '@ui/primitives/input';
import { Link, Paperclip, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type ReactElement, useRef } from 'react';

export interface PromptBarReferenceControlsProps {
  accept?: string;
  className?: string;
  density?: 'compact' | 'default';
  isAttachmentDisabled?: boolean;
  isLibraryDisabled?: boolean;
  label?: string;
  onAddFiles?: (files: File[]) => void;
  onOpenLibrary: () => void;
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
}: PromptBarReferenceControlsProps): ReactElement {
  const translate = useTranslations('agent.composerToolbar');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controlSize = density === 'compact' ? 'size-8' : 'size-9';
  const isMenuDisabled =
    (onAddFiles ? isAttachmentDisabled : true) && isLibraryDisabled;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onAddFiles?.(files);
    }
    event.target.value = '';
  };

  return (
    <div className={cn('contents', className)}>
      {onAddFiles ? (
        <Input
          ref={fileInputRef}
          accept={accept}
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
            ariaLabel={label ?? translate('addContext')}
            className={cn('shrink-0', label ? 'h-8 gap-1.5 px-2' : controlSize)}
            icon={<Plus className="size-4" />}
            isDisabled={isMenuDisabled}
            size={label ? ButtonSize.SM : ButtonSize.ICON}
            tooltip={label ?? translate('addContext')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" side="top">
          <DropdownMenuLabel>
            {label ?? translate('addContext')}
          </DropdownMenuLabel>
          {onAddFiles ? (
            <DropdownMenuItem
              disabled={isAttachmentDisabled}
              onSelect={() => fileInputRef.current?.click()}
            >
              <Paperclip className="mr-2 size-4" />
              {translate('attachFiles')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={isLibraryDisabled}
            onSelect={onOpenLibrary}
          >
            <Link className="mr-2 size-4" />
            {translate('referenceLibrary')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
