'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { VideoTextOverlayPanelProps } from '@genfeedai/props/content/ingredient.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useState } from 'react';
import { HiXMark } from 'react-icons/hi2';

export default function TextOverlayPanel({
  video,
  isOpen,
  onClose,
  onSuccess,
}: VideoTextOverlayPanelProps) {
  const notificationsService = NotificationsService.getInstance();
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [text, setText] = useState('');
  const [position, setPosition] = useState('center');
  const [fontSize, setFontSize] = useState('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) {
      return notificationsService.error('Please enter text');
    }

    setIsSubmitting(true);
    try {
      const service = (await getVideosService()) as VideosService;
      await service.postTextOverlay(video.id, {
        fontSize,
        position,
        text: text.trim(),
      });

      notificationsService.success('Adding text overlay...');
      handleClose();
      onSuccess?.();
      setIsSubmitting(false);
    } catch (error) {
      logger.error('Failed to add text overlay', error);
      notificationsService.error('Failed to add text overlay');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setText('');
    setPosition('center');
    setFontSize('medium');
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-card shadow-xl z-50 transform transition-transform duration-300">
        <div className="flex flex-col h-full">
          {/* Panel header - title and close button */}
          <div className="flex items-center justify-between p-6 border-b border-white/[0.08]">
            <h3 className="text-xl font-semibold">Add Text Overlay</h3>
            <Button
              label={<HiXMark className="text-xl" />}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="rounded-full"
              onClick={handleClose}
            />
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-4">
              <FormControl
                label="Text"
                error={!text.trim() && isSubmitting ? 'Text is required' : ''}
                isRequired
              >
                <Input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter text to overlay on video"
                />
              </FormControl>

              <FormControl label="Position">
                <Select value={position} onValueChange={setPosition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>

              <FormControl label="Font Size">
                <Select value={fontSize} onValueChange={setFontSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select font size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="extra-large">Extra Large</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>

              {/* Preview section */}
              <div className="mt-6">
                <label className="text-sm font-medium mb-2 block">
                  Preview
                </label>
                <div className="relative bg-background aspect-video flex items-center justify-center">
                  <div
                    className={`absolute ${getPositionClasses(position)} p-4`}
                    style={{ fontSize: getFontSize(fontSize) }}
                  >
                    <span className="text-white drop-shadow-lg font-semibold">
                      {text || 'Your text will appear here'}
                    </span>
                  </div>
                  <span className="text-foreground/30 text-sm">
                    Video Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/[0.08]">
            <div className="flex gap-3 justify-end">
              <Button
                label="Cancel"
                variant={ButtonVariant.SECONDARY}
                onClick={handleClose}
                isDisabled={isSubmitting}
              />

              <Button
                label="Add Text Overlay"
                variant={ButtonVariant.DEFAULT}
                onClick={handleSubmit}
                isLoading={isSubmitting}
                isDisabled={!text.trim()}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getPositionClasses(position: string): string {
  switch (position) {
    case 'top':
      return 'top-4 left-1/2 -translate-x-1/2';
    case 'center':
      return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
    case 'bottom':
      return 'bottom-4 left-1/2 -translate-x-1/2';
    case 'top-left':
      return 'top-4 left-4';
    case 'top-right':
      return 'top-4 right-4';
    case 'bottom-left':
      return 'bottom-4 left-4';
    case 'bottom-right':
      return 'bottom-4 right-4';
    default:
      return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
  }
}

function getFontSize(size: string): string {
  switch (size) {
    case 'small':
      return '0.875rem';
    case 'medium':
      return '1rem';
    case 'large':
      return '1.25rem';
    case 'extra-large':
      return '1.5rem';
    default:
      return '1rem';
  }
}
