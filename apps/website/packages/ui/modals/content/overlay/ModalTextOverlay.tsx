'use client';

import type { ITextOverlayErrors } from '@genfeedai/interfaces/ui/text-overlay-errors.interface';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ModalTextOverlayProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VideosService } from '@services/ingredients/videos.service';
import Button from '@ui/buttons/base/Button';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import Modal from '@ui/modals/modal/Modal';
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
          <FormInput
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
          <select
            className="h-10 border border-input px-3 w-full bg-background"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </FormControl>

        <FormControl label="Font Size">
          <select
            className="h-10 border border-input px-3 w-full bg-background"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="extra-large">Extra Large</option>
          </select>
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
