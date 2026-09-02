'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AgentMediaArtifactKind,
  AgentMediaArtifactPreviewProps,
  AgentMediaExpandedAssetProps,
  AgentMediaImageAssetProps,
  AgentMediaInlineAssetProps,
} from '@genfeedai/props/ui/agent/agent-media-artifact-preview.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@ui/primitives/dialog';
import { ChevronLeft, ChevronRight, Expand, Music } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';

export type {
  AgentMediaArtifact,
  AgentMediaArtifactKind,
} from '@genfeedai/props/ui/agent/agent-media-artifact-preview.props';

function formatKind(kind: AgentMediaArtifactKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function ImageAsset({
  alt,
  className,
  src,
}: AgentMediaImageAssetProps): ReactElement {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <span className="relative block h-full w-full overflow-hidden">
      {!isLoaded ? (
        <span className="absolute inset-0 animate-pulse bg-muted" />
      ) : null}
      <img
        alt={alt}
        className={cn(
          'h-full w-full transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
        onLoad={() => setIsLoaded(true)}
        src={src}
      />
    </span>
  );
}

function InlineAsset({
  asset,
  displayMode,
  index,
  onOpen,
}: AgentMediaInlineAssetProps): ReactElement {
  const title = asset.title?.trim() || `Generated ${asset.kind} ${index + 1}`;
  const isFeatured = displayMode === 'featured';

  if (asset.kind === 'image') {
    return (
      <Button
        ariaLabel={`Open ${title} preview`}
        className={cn(
          'group relative block w-full overflow-hidden bg-background-secondary p-0 shadow-border transition-shadow hover:shadow-border-strong',
          isFeatured
            ? 'aspect-[4/5] rounded-[1.25rem]'
            : 'aspect-square rounded-lg',
        )}
        onClick={() => onOpen(index)}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <ImageAsset
          alt={asset.alt?.trim() || title}
          className="object-cover"
          src={asset.url}
        />
        <span
          className={
            'absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/65 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100' /* design-system-allow-content-color */
          }
        >
          <Expand className="size-3.5" aria-hidden />
        </span>
      </Button>
    );
  }

  if (asset.kind === 'video') {
    return (
      <div
        className={cn(
          'overflow-hidden bg-background-secondary shadow-border',
          isFeatured ? 'rounded-[1.25rem]' : 'rounded-lg',
        )}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: user-generated video content */}
        <video
          aria-label={title}
          className={cn(
            'w-full bg-black object-contain' /* design-system-allow-content-color */,
            isFeatured ? 'aspect-[4/5]' : 'aspect-video',
          )}
          controls
          playsInline
          preload="metadata"
          src={asset.url}
        />
        <div className="flex justify-end p-1.5">
          <Button
            ariaLabel={`Expand ${title} preview`}
            icon={<Expand className="size-3.5" />}
            label="Open preview"
            onClick={() => onOpen(index)}
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-background-secondary p-3 shadow-border',
        isFeatured ? 'rounded-[1.25rem] p-4' : 'rounded-lg',
      )}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Music className="size-4 text-primary/80" aria-hidden />
        <span className="truncate">{title}</span>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: generated audio does not include a caption track */}
      <audio aria-label={title} className="w-full" controls src={asset.url} />
      <div className="mt-1.5 flex justify-end">
        <Button
          ariaLabel={`Expand ${title} preview`}
          icon={<Expand className="size-3.5" />}
          label="Open preview"
          onClick={() => onOpen(index)}
          size={ButtonSize.XS}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
    </div>
  );
}

function ExpandedAsset({
  asset,
  title,
}: AgentMediaExpandedAssetProps): ReactElement {
  if (asset.kind === 'image') {
    return (
      <img
        alt={title}
        className="max-h-[72dvh] max-w-full object-contain"
        src={asset.url}
      />
    );
  }

  if (asset.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user-generated video content
      <video
        aria-label={`${title} expanded preview`}
        className={
          'max-h-[72dvh] max-w-full bg-black object-contain' /* design-system-allow-content-color */
        }
        controls
        playsInline
        preload="metadata"
        src={asset.url}
      />
    );
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-background-secondary p-6 shadow-border">
      <div className="mb-5 flex items-center gap-3 text-base font-semibold text-foreground">
        <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-border">
          <Music className="size-5 text-primary/80" aria-hidden />
        </span>
        <span className="truncate">{title}</span>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: generated audio does not include a caption track */}
      <audio
        aria-label={`${title} expanded preview`}
        className="w-full"
        controls
        src={asset.url}
      />
    </div>
  );
}

export function AgentMediaArtifactPreview({
  assets,
  className,
  displayMode = 'grid',
  title = 'Generated assets',
}: AgentMediaArtifactPreviewProps): ReactElement | null {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const visibleAssets = assets.filter((asset) => asset.url.trim());
  const activeAsset = visibleAssets[activeIndex] ?? visibleAssets[0];

  const openAsset = useCallback((index: number) => {
    setActiveIndex(index);
    setIsOpen(true);
  }, []);
  const showPrevious = useCallback(() => {
    setActiveIndex((index) =>
      index <= 0 ? visibleAssets.length - 1 : index - 1,
    );
  }, [visibleAssets.length]);
  const showNext = useCallback(() => {
    setActiveIndex((index) =>
      index >= visibleAssets.length - 1 ? 0 : index + 1,
    );
  }, [visibleAssets.length]);
  const handleDialogKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (visibleAssets.length <= 1) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPrevious();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNext();
      }
    },
    [showNext, showPrevious, visibleAssets.length],
  );

  if (!activeAsset) {
    return null;
  }

  const activeTitle =
    activeAsset.title?.trim() ||
    (visibleAssets.length > 1 ? `${title} ${activeIndex + 1}` : title);
  const isAudioCollection = visibleAssets.every(
    (asset) => asset.kind === 'audio',
  );
  const isVideoCollection = visibleAssets.every(
    (asset) => asset.kind === 'video',
  );

  return (
    <div className={className}>
      <div
        className={cn(
          displayMode === 'featured'
            ? 'block'
            : isAudioCollection
              ? 'space-y-2'
              : cn(
                  'grid gap-2',
                  isVideoCollection
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3',
                ),
        )}
      >
        {visibleAssets.map((asset, index) => (
          <InlineAsset
            key={`${asset.kind}-${asset.url}`}
            asset={asset}
            displayMode={displayMode}
            index={index}
            onOpen={openAsset}
          />
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogPortal>
          <DialogOverlay
            className={
              'bg-black/80 backdrop-blur-[1px]' /* design-system-allow-content-color */
            }
          />
          <DialogContent
            aria-describedby="agent-media-preview-description"
            className="flex max-h-[92dvh] w-[min(96vw,72rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-popover p-0 shadow-dialog"
            data-workspace-shell-overlay="true"
            onKeyDown={handleDialogKeyDown}
          >
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
              <DialogTitle>{activeTitle}</DialogTitle>
              <DialogDescription id="agent-media-preview-description">
                {formatKind(activeAsset.kind)} preview
                {visibleAssets.length > 1
                  ? ` · ${activeIndex + 1} of ${visibleAssets.length}`
                  : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="relative flex min-h-72 flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
              <ExpandedAsset asset={activeAsset} title={activeTitle} />
              {visibleAssets.length > 1 ? (
                <>
                  <Button
                    ariaLabel="Previous generated asset"
                    className={
                      'absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/75' /* design-system-allow-content-color */
                    }
                    icon={<ChevronLeft className="size-5" />}
                    onClick={showPrevious}
                    size={ButtonSize.ICON}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                  <Button
                    ariaLabel="Next generated asset"
                    className={
                      'absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 text-white hover:bg-black/75' /* design-system-allow-content-color */
                    }
                    icon={<ChevronRight className="size-5" />}
                    onClick={showNext}
                    size={ButtonSize.ICON}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                </>
              ) : null}
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
