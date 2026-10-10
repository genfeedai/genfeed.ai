'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  StudioPlaygroundFocusedPreviewProps,
  StudioPlaygroundFocusedThumbnailProps,
} from '@genfeedai/props/studio/studio-playground.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthorizedMediaPreview } from '@hooks/media/use-authorized-media-preview';
import { resolveFocusedStudioJobs } from '@pages/studio/playground/utils/studio-playground-gallery';
import { studioAssetAccessibleLabel } from '@pages/studio/playground/utils/studio-playground-recipe';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

function FocusedThumbnail({
  job,
  isSelected,
  onSelect,
}: StudioPlaygroundFocusedThumbnailProps) {
  const preview = useAuthorizedMediaPreview(job.ingredient ?? null);
  const src = preview
    ? preview.state === 'READY'
      ? job.type === 'image' || job.type === 'image-edit'
        ? preview.url
        : job.ingredient?.thumbnailUrl
      : null
    : job.ingredient?.thumbnailUrl;
  const label = studioAssetAccessibleLabel(job);
  return (
    <Button
      ariaLabel={label}
      aria-pressed={isSelected}
      className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-md p-0 ${isSelected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
      onClick={() => onSelect(job)}
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      {src ? (
        <Image alt="" className="object-cover" fill sizes="80px" src={src} />
      ) : (
        <ImageOff aria-hidden="true" className="size-5 text-muted-foreground" />
      )}
    </Button>
  );
}

/** In-page media iteration; the workspace retains its only composer and draft. */
export default function StudioPlaygroundFocusedPreview({
  children,
  job,
  jobs,
  onClose,
  onSelect,
}: StudioPlaygroundFocusedPreviewProps) {
  const translate = useTranslations('pages.studioPlayground.focusedPreview');
  const { brandId } = useBrand();
  const { orgId } = useAuthIdentity();
  const isInScope = (candidate: typeof job) =>
    !candidate.ingredient ||
    (!candidate.ingredient.isDeleted &&
      candidate.ingredient.brandId === brandId &&
      (!orgId ||
        !candidate.ingredient.organizationId ||
        candidate.ingredient.organizationId === orgId));
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigation = jobs.filter(
    (candidate) => isInScope(candidate) && !candidate.ingredient?.isDeleted,
  );
  const groups = resolveFocusedStudioJobs(job, navigation);
  const index = navigation.findIndex((candidate) => candidate.id === job.id);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      // Preserve Escape ownership for an active menu, dialog or text editor.
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        target?.closest(
          '[role="dialog"], [role="menu"], [role="listbox"], input, textarea, [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  if (!isInScope(job)) return <p role="status">{translate('unavailable')}</p>;
  return (
    <section
      aria-label={translate('title')}
      className="flex min-w-0 flex-col gap-4"
      data-testid="studio-focused-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          ref={closeRef}
          icon={<ArrowLeft className="size-4" />}
          label={translate('back')}
          onClick={onClose}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
        <div className="flex items-center gap-1">
          <Button
            ariaLabel={translate('previous')}
            icon={<ChevronLeft className="size-4" />}
            isDisabled={index <= 0}
            onClick={() => {
              const previous = navigation[index - 1];
              if (previous) onSelect(previous);
            }}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
          <Button
            ariaLabel={translate('next')}
            icon={<ChevronRight className="size-4" />}
            isDisabled={index < 0 || index >= navigation.length - 1}
            onClick={() => {
              const next = navigation[index + 1];
              if (next) onSelect(next);
            }}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      </div>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="text-xs text-muted-foreground"
      >
        {translate('loadedOnly')}
      </div>
      {(
        [
          ['related', groups.related],
          ['recent', groups.recent],
        ] as const
      ).map(([key, group]) =>
        group.length > 0 ? (
          <div key={key} className="min-w-0">
            <p className="mb-2 text-xs font-medium">{translate(key)}</p>
            <div
              aria-label={translate(key)}
              role="group"
              className="flex gap-3 overflow-x-auto p-1"
            >
              {group.map((candidate) => (
                <FocusedThumbnail
                  key={candidate.id}
                  job={candidate}
                  isSelected={candidate.id === job.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ) : null,
      )}
    </section>
  );
}
