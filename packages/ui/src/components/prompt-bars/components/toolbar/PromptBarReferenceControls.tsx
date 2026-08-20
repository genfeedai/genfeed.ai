'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Link, Paperclip } from 'lucide-react';
import { type ChangeEvent, type ReactElement, useRef } from 'react';

export interface PromptBarReferenceControlsProps {
  accept?: string;
  className?: string;
  density?: 'compact' | 'default';
  isAttachmentDisabled?: boolean;
  isLibraryDisabled?: boolean;
  onAddFiles?: (files: File[]) => void;
  onOpenLibrary: () => void;
}

/** Shared attachment and Library controls used by Agent and Studio composers. */
export default function PromptBarReferenceControls({
  accept = 'image/*,video/*,audio/*',
  className,
  density = 'default',
  isAttachmentDisabled = false,
  isLibraryDisabled = false,
  onAddFiles,
  onOpenLibrary,
}: PromptBarReferenceControlsProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controlSize = density === 'compact' ? 'size-8' : 'size-9';

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
        <>
          <Input
            ref={fileInputRef}
            accept={accept}
            aria-label="Choose composer attachments"
            className="sr-only"
            multiple
            onChange={handleFileChange}
            type="file"
          />
          <Button
            ariaLabel="Attach files"
            className={cn('shrink-0', controlSize)}
            icon={<Paperclip className="size-4" />}
            isDisabled={isAttachmentDisabled}
            onClick={() => fileInputRef.current?.click()}
            size={ButtonSize.ICON}
            tooltip="Attach files"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </>
      ) : null}

      <Button
        ariaLabel="Reference library content"
        className={cn('shrink-0', controlSize)}
        icon={<Link className="size-4" />}
        isDisabled={isLibraryDisabled}
        onClick={onOpenLibrary}
        size={ButtonSize.ICON}
        tooltip="Reference library content"
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </div>
  );
}
