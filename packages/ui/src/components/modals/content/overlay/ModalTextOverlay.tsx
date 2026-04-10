'use client';

import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ITextOverlayErrors } from '@genfeedai/interfaces/ui/text-overlay-errors.interface';
import type { ModalTextOverlayProps } from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import Modal from '@ui/modals/modal/Modal';
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

export default function ModalTextOverlay({
  video,
  onConfirm,
}: ModalTextOverlayProps) {
  const notificationsService = NotificationsService.getInstance();

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [text, setText] = useState('');
  const [position, setPosition] = useState('center');
  const [fontSize, setFontSize] = useState('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ITextOverlayErrors>({});
  const [error, setError] = useState<string | null>(null);

  const validateForm = () => {
    const newErrors: ITextOverlayErrors = {};
    if (!text.trim()) {
      newErrors.text = 'Text is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError(null); // Clear any previous errors
    try {
      const service = (await getVideosService()) as VideosService;
      await service.postTextOverlay(video.id, {
        fontSize,
        position,
        text: text.trim(),
      });

      notificationsService.success('Adding text overlay...');
      closeModalTextOverlay();
      onConfirm?.();
      setIsSubmitting(false);
    } catch (error) {
      logger.error('Failed to add text overlay', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to add text overlay';
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  const closeModalTextOverlay = () => {
    closeModal(ModalEnum.TEXT_OVERLAY);
    setText('');
    setPosition('center');
    setFontSize('medium');
    setErrors({});
    setError(null); // Clear error when closing modal
  };

  return (
    <Modal
      id={ModalEnum.TEXT_OVERLAY}
      title="Add Text Overlay"
      error={error}
      onClose={() => setError(null)}
    >
      <div className="space-y-2">
        <FormControl label="Text" error={errors.text} isRequired>
          <Input
            name="text"
            type="text"
            placeholder="Enter text to overlay on video"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (errors.text) {
                setErrors({ ...errors, text: undefined });
              }
            }}
          />
        </FormControl>

        <FormControl label="Position">
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger>
              <SelectValue />
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
              <SelectItem value="extra-large">Extra Large</SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button
          label="Cancel"
          variant={ButtonVariant.GHOST}
          onClick={() => closeModalTextOverlay()}
          isDisabled={isSubmitting}
        />

        <Button
          label="Add Text"
          variant={ButtonVariant.DEFAULT}
          onClick={handleSubmit}
          isLoading={isSubmitting}
          isDisabled={!text.trim()}
        />
      </div>
    </Modal>
  );
}
