'use client';

import {
  ButtonSize,
  ButtonVariant,
  ModalEnum,
  PostStatus,
} from '@genfeedai/enums';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalPostRemixProps } from '@props/modals/modal-post-remix.props';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiDocumentDuplicate } from 'react-icons/hi2';

export default function ModalPostRemix({
  post,
  isOpen,
  openKey,
  onSubmit,
  onClose,
}: ModalPostRemixProps) {
  useModalAutoOpen(ModalEnum.POST_REMIX, { isOpen, openKey });

  // Refs for callbacks to prevent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const [description, setDescription] = useState(post.description || '');
  const [label, setLabel] = useState(`Remix: ${post.label || 'Untitled'}`);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when post changes
  useEffect(() => {
    setDescription(post.description || '');
    setLabel(`Remix: ${post.label || 'Untitled'}`);
  }, [post]);

  // Called when Cancel button is clicked - initiates the close
  const handleCancel = useCallback(() => {
    closeModal(ModalEnum.POST_REMIX);
    onCloseRef.current?.();
  }, []);

  // Called by Modal's onClose after modal is closed - just cleanup, no re-close
  const handleModalClosed = useCallback(() => {
    // Parent cleanup only, modal is already closed
    onCloseRef.current?.();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      await onSubmitRef.current(description, label);
      handleCancel();
    } finally {
      setIsLoading(false);
    }
  }, [description, label, handleCancel]);

  return (
    <Modal
      id={ModalEnum.POST_REMIX}
      title="Create Remix Post"
      onClose={handleModalClosed}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-foreground/70 bg-background/50 p-3">
          <HiDocumentDuplicate className="w-5 h-5 text-primary" />
          <span>
            Create a variant of this post with different wording. The original
            post&apos;s media, platform, and settings will be copied.
          </span>
        </div>

        {post.status === PostStatus.PUBLIC && (
          <div className="text-xs text-success bg-success/10 px-3 py-2">
            Original post has {post.totalViews || 0} views -{' '}
            {post.totalLikes || 0} likes
          </div>
        )}

        <FormControl label="Label">
          <Input
            name="remixLabel"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Enter label for the remix"
          />
        </FormControl>

        <FormControl label="Description" isRequired>
          <LazyRichTextEditor
            value={description}
            onChange={setDescription}
            minHeight={{ desktop: 200, mobile: 150 }}
            placeholder="Enter new description/caption..."
          />
        </FormControl>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleCancel}
            isDisabled={isLoading}
          />

          <Button
            label="Create Remix"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={handleSubmit}
            isLoading={isLoading}
            isDisabled={!description.trim()}
          />
        </ModalActions>
      </div>
    </Modal>
  );
}
