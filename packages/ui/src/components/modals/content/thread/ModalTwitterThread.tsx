'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ModalTwitterThreadProps } from '@props/modals/modal-twitter-thread.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import { Modal } from '@ui/modals/compound/Modal';
import { HiXMark } from 'react-icons/hi2';

export default function ModalTwitterThread({
  thread,
  isOpen,
  onClose,
  clipboardService,
  notificationsService,
}: ModalTwitterThreadProps) {
  const handleCopyAll = () => {
    if (!thread) {
      return;
    }

    const threadText = thread.tweets
      .map((t) => `${t.order}/${thread.totalTweets}\n${t.content}`)
      .join('\n\n---\n\n');

    clipboardService.copyToClipboard(threadText);
    notificationsService.success('Thread copied to clipboard');
  };

  if (!thread) {
    return null;
  }

  return (
    <Modal.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Content size="lg" className="w-full max-w-2xl">
        <Modal.Header>
          <Modal.Title className="font-bold text-lg mb-0">
            Twitter Thread Preview{' '}
            <Badge variant="outline" size={ComponentSize.SM}>
              {thread.totalTweets} tweets
            </Badge>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="max-h-96 overflow-y-auto">
          <div className="space-y-3">
            {thread.tweets.map((tweet) => (
              <div key={tweet.order} className="p-4 border border-white/[0.08]">
                <div className="flex justify-between items-start mb-2">
                  <Badge size={ComponentSize.SM} variant="outline">
                    Tweet {tweet.order}
                  </Badge>
                  <span className="text-xs text-foreground/60">
                    {tweet.characterCount}/280
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{tweet.content}</p>
              </div>
            ))}
          </div>
        </Modal.Body>

        <Modal.Footer className="mt-2">
          <Button
            label="Close"
            variant={ButtonVariant.GHOST}
            icon={<HiXMark />}
            onClick={onClose}
          />

          <Button
            label="Copy All"
            variant={ButtonVariant.DEFAULT}
            onClick={handleCopyAll}
          />
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
