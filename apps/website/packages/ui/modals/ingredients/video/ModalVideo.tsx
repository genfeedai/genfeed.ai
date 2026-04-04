'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientFormat,
} from '@genfeedai/enums';
import type { ModalVideoProps } from '@props/modals/modal.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import Masonry from '@ui/display/masonry/Masonry';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Spinner from '@ui/feedback/spinner/Spinner';
import { HiVideoCamera, HiXMark } from 'react-icons/hi2';

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

  // Get aspect ratio class based on format
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

  // Get format label
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">
                {selectedFrameIndex !== null
                  ? `Replace Frame ${selectedFrameIndex + 1}`
                  : 'Select a Video'}
              </h3>
              <p className="text-sm text-foreground/60 mt-1">
                Showing {format} videos ({getFormatLabel()})
              </p>
            </div>
            <Button
              label={<HiXMark className="text-lg" />}
              onClick={onClose}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="rounded-full"
            />
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-card">
          {isLoadingVideos ? (
            <div className="flex justify-center py-12">
              <Spinner size={ComponentSize.LG} />
            </div>
          ) : availableVideos.length === 0 ? (
            <div className="text-center py-12">
              <HiVideoCamera className="text-5xl text-foreground/20 mx-auto mb-3" />
              <p className="text-foreground/60">No {format} videos available</p>
              <p className="text-sm text-foreground/40 mt-2">
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
                <div
                  key={video.id}
                  className="cursor-pointer group"
                  onClick={() => onSelect(video)}
                >
                  <div
                    className={`relative ${getAspectClass()} bg-background overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-105`}
                  >
                    <VideoPlayer
                      src={
                        video.ingredientUrl ||
                        `${EnvironmentService.ingredientsEndpoint}/videos/${video.id}`
                      }
                      // thumbnail={
                      //   video.thumbnailUrl ||
                      //   `${EnvironmentService.ingredientsEndpoint}/videos/${video.id}/thumbnail`
                      // }
                      config={{
                        controls: false,
                        loop: false,
                        muted: true,
                        playsInline: true,
                        preload: 'metadata',
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-white text-xs font-medium">
                        Select
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-2 truncate text-center text-foreground/70">
                    {video.metadataLabel || `Video ${video.id.slice(0, 8)}`}
                  </p>
                </div>
              ))}
            </Masonry>
          )}
        </div>
      </div>
    </div>
  );
}
