'use client';

import type { AgentThread } from '@genfeedai/agent';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  AgentThreadHandoffApi,
  AgentThreadMember,
} from '@/components/workspace-shell/props/agent-threads-panel.props';

interface AgentThreadHandoffDialogProps {
  apiService: AgentThreadHandoffApi;
  isOpen: boolean;
  members: readonly AgentThreadMember[];
  onOpenChange: (isOpen: boolean) => void;
  /** Called with the teammate's name once the request is sent. */
  onSent: (name: string) => void;
  thread: AgentThread;
}

const TITLE_LENGTH = 60;

/**
 * Hand this thread's work to a teammate's agent. They get the request in a new
 * thread of their own and run it with their permissions only once they accept;
 * they can decline. Only teammates who reach the thread's brand are offered.
 */
export default function AgentThreadHandoffDialog({
  apiService,
  isOpen,
  members,
  onOpenChange,
  onSent,
  thread,
}: AgentThreadHandoffDialogProps) {
  const translate = useTranslations('common.agentThreads.handoff');
  const [pickedUserId, setPickedUserId] = useState<string | null>(null);
  const [request, setRequest] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  // One key per opening of the dialog: a retry of the same hand-off reuses it.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const teammates = members.filter(
    (member) =>
      member.userId !== thread.userId &&
      (!thread.brandId || member.brandIds.includes(thread.brandId)),
  );
  const teammate =
    teammates.find((member) => member.userId === pickedUserId) ?? teammates[0];
  const content = request.trim();
  const canSend = Boolean(teammate) && content.length > 0 && !isBusy;

  const handleOpenChange = (nextIsOpen: boolean) => {
    if (nextIsOpen) {
      setIdempotencyKey(crypto.randomUUID());
      setHasFailed(false);
    }
    onOpenChange(nextIsOpen);
  };

  const send = async () => {
    if (!teammate || !canSend) {
      return;
    }
    setIsBusy(true);
    setHasFailed(false);
    try {
      await apiService.createAgentHandoff({
        content,
        destinationTitle: content.slice(0, TITLE_LENGTH),
        destinationUserId: teammate.userId,
        idempotencyKey,
        sourceThreadId: thread.id,
      });
      setRequest('');
      onSent(teammate.name);
      onOpenChange(false);
    } catch {
      setHasFailed(true);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {teammates.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              {translate('noTeammates')}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-handoff-teammate">
                  {translate('teammate')}
                </Label>
                <Select
                  onValueChange={setPickedUserId}
                  value={teammate?.userId}
                >
                  <SelectTrigger
                    aria-label={translate('teammate')}
                    id="agent-handoff-teammate"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teammates.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.roleLabel
                          ? `${member.name} · ${member.roleLabel}`
                          : member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-handoff-request">
                  {translate('request')}
                </Label>
                <Textarea
                  id="agent-handoff-request"
                  maxLength={12000}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder={translate('requestPlaceholder')}
                  value={request}
                />
              </div>
            </>
          )}
          {hasFailed ? (
            <p className="text-sm text-destructive" role="alert">
              {translate('failed')}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            variant={ButtonVariant.GHOST}
          >
            {translate('cancel')}
          </Button>
          <Button
            isDisabled={!canSend}
            onClick={() => void send()}
            variant={ButtonVariant.DEFAULT}
          >
            {translate('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
