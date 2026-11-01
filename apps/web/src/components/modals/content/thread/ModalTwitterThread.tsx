'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { X } from 'lucide-react';
import type { ModalTwitterThreadProps } from '@/props/modals/modal-twitter-thread.props';

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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg" className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-lg">
            Twitter Thread Preview{' '}
            <Badge variant="outline">{thread.totalTweets} tweets</Badge>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="max-h-96">
          <div className="space-y-3">
            {thread.tweets.map((tweet) => (
              <div key={tweet.order} className="p-4 bg-muted shadow-border">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="outline">Tweet {tweet.order}</Badge>
                  <span className="text-xs text-foreground/60">
                    {tweet.characterCount}/280
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{tweet.content}</p>
              </div>
            ))}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            label="Close"
            variant={ButtonVariant.GHOST}
            icon={<X />}
            onClick={onClose}
          />

          <Button
            label="Copy All"
            variant={ButtonVariant.DEFAULT}
            onClick={handleCopyAll}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
