'use client';

import {
  ButtonVariant,
  ComponentSize,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModalVideoProps } from '@genfeedai/props/modals/modal.props';
import Masonry from '@ui/display/masonry/Masonry';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Spinner from '@ui/primitives/spinner';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import { Video } from 'lucide-react';
import { useIngredientMediaUrl } from '@/hooks/media/use-ingredient-media-url';

function ModalVideoPreview({ video }: { video: IVideo }) {
  const src = useIngredientMediaUrl(video);

  return (
    <VideoPlayer
      src={src}
      config={{
        controls: false,
        loop: false,
        muted: true,
        playsInline: true,
        preload: 'metadata',
      }}
    />
  );
}

export default function ModalVideo({
  isOpen,
  onClose,
  onSelect,
  availableVideos,
  isLoadingVideos,
  selectedFrameIndex,
  format = IngredientFormat.PORTRAIT,
}: ModalVideoProps) {
  if (!isOpen) {
    return null;
  }

  const getAspectClass = () => {
    switch (format) {
      case IngredientFormat.LANDSCAPE:
        return 'aspect-[16/9]';
      case IngredientFormat.SQUARE:
        return 'aspect-[1/1]';
      default:
        return 'aspect-[9/16]';
    }
  };

  const getFormatLabel = () => {
    switch (format) {
      case IngredientFormat.LANDSCAPE:
        return '16:9';
      case IngredientFormat.SQUARE:
        return '1:1';
      default:
        return '9:16';
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isDialogOpen) => {
        if (!isDialogOpen) {
          onClose();
        }
      }}
    >
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {selectedFrameIndex !== null
              ? `Replace Frame ${selectedFrameIndex + 1}`
              : 'Select a Video'}
          </DialogTitle>
          <DialogDescription>
            Showing {format} videos ({getFormatLabel()})
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoadingVideos ? (
            <div className="flex justify-center py-12">
              <Spinner size={ComponentSize.LG} />
            </div>
          ) : availableVideos.length === 0 ? (
            <div className="text-center py-12">
              <Video className="text-5xl text-foreground/20 mx-auto mb-3" />
              <p className="text-foreground/60">No {format} videos available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Generate some videos in this format first
              </p>
            </div>
          ) : (
            <Masonry
              columns={{
                default: 3,
                lg: 6,
                md: 5,
                sm: 4,
              }}
              gap={4}
              className="w-full"
            >
              {availableVideos.map((video) => (
                <Button
                  key={video.id}
                  className="block w-full cursor-pointer group text-left"
                  onClick={() => onSelect(video)}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <div
                    className={`relative ${getAspectClass()} bg-background overflow-hidden shadow-border group-hover:shadow-border-strong transition-[box-shadow,transform] group-hover:scale-105`}
                  >
                    <ModalVideoPreview video={video} />
                    <div
                      className={cn(
                        'absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-3 transition-opacity',
                        hoverRevealClassName({ isInteractive: false }),
                      )}
                    >
                      <span
                        className={
                          'text-xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
                        }
                      >
                        Select
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-2 truncate text-center text-foreground/70">
                    {video.metadataLabel || `Video ${video.id.slice(0, 8)}`}
                  </p>
                </Button>
              ))}
            </Masonry>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
