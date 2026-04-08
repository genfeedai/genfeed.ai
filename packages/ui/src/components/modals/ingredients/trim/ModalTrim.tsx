'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useVideoTrim } from '@hooks/media/use-video-trim/use-video-trim';
import type { ModalTrimProps } from '@props/modals/modal.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import VideoTrimTimeline from '@ui/display/video-trim-timeline/VideoTrimTimeline';
import Alert from '@ui/feedback/alert/Alert';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { HiPlay, HiXMark } from 'react-icons/hi2';

export default function ModalTrim({
  videoUrl,
  videoId,
  videoDuration,
  onConfirm,
  onClose,
}: ModalTrimProps) {
  const modalId = `modal-trim-${videoId}`;

  const {
    videoRef,
    startTime,
    endTime,
    trimDuration,
    thumbnails,
    isGeneratingThumbnails,
    error,
    isValid,
    handleRangeChange,
    playTrimmedPortion,
  } = useVideoTrim({
    maxDuration: 15,
    minDuration: 2,
    videoDuration,
    videoUrl,
  });

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(startTime, endTime);
      closeModal(modalId);
    }
  };

  const handleClose = () => {
    closeModal(modalId);
    onClose();
  };

  return (
    <Modal
      id={modalId}
      title="Trim Video"
      isFullScreen
      onClose={handleClose}
      modalBoxClassName="p-6"
    >
      <div className="flex flex-col h-full gap-6">
        {/* Video Player Section */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden">
          <div className="relative w-full h-full max-h-full">
            <VideoPlayer
              videoRef={videoRef}
              src={videoUrl}
              config={{
                autoPlay: false,
                controls: true,
                loop: false,
                muted: false,
                playsInline: true,
                preload: 'metadata',
              }}
            />
          </div>
        </div>

        {/* Timeline Section */}
        <div className="flex-shrink-0 space-y-4">
          <VideoTrimTimeline
            videoDuration={videoDuration}
            startTime={startTime}
            endTime={endTime}
            thumbnails={thumbnails}
            isGeneratingThumbnails={isGeneratingThumbnails}
            onRangeChange={handleRangeChange}
          />

          {/* Error Display */}
          {error && <Alert type={AlertCategory.ERROR}>{error}</Alert>}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                label="Preview Clip"
                icon={<HiPlay />}
                onClick={playTrimmedPortion}
                variant={ButtonVariant.SECONDARY}
                isDisabled={!isValid}
                tooltip="Play the selected clip"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                label="Cancel"
                icon={<HiXMark />}
                onClick={handleClose}
                variant={ButtonVariant.SECONDARY}
              />
              <Button
                label="Confirm"
                onClick={handleConfirm}
                variant={ButtonVariant.DEFAULT}
                isDisabled={!isValid}
                tooltip={
                  !isValid
                    ? 'Please select a clip between 2-15 seconds'
                    : `Trim video to ${Math.floor(trimDuration)}s clip`
                }
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
