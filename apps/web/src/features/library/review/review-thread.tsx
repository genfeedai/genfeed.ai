'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  AgentThreadMessagesService,
  MENTION_NEEDS_SHARE,
  ThreadMentionRefusedError,
} from '@genfeedai/services/management/agent-thread-messages.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowUp, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useAgentThreadMembers } from '@/components/workspace-shell/use-agent-thread-members';
import {
  activeMentionQuery,
  insertMention,
  type MentionablePerson,
  matchMentionable,
  mentionedUserIds,
  mentionToken,
  splitMentions,
} from './review-mentions';
import { useIngredientReviewCandidates } from './use-ingredient-review';
import {
  REVIEW_THREAD_MESSAGES_QUERY_KEY,
  useReviewThreadMessages,
} from './use-review-thread';

interface ShareRequest {
  canShare: boolean;
  message: string;
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The conversation a review request opened, inside the asset panel: read it,
 * reply, and tag a teammate with @. Only teammates who reach the asset's brand
 * are offered; one who cannot open the thread yet is offered a share at "Can
 * view" before the message goes out.
 */
export default function ReviewThread({
  ingredient,
  threadId,
}: {
  ingredient: IIngredient;
  threadId: string;
}) {
  const translate = useTranslations('pages.library.teamReview.thread');
  const queryClient = useQueryClient();
  const getMessagesService = useAuthedService((token: string) =>
    AgentThreadMessagesService.getInstance(token),
  );
  const { messages } = useReviewThreadMessages(threadId);
  const { members, membersById } = useAgentThreadMembers();
  const { reviewerUserIds } = useIngredientReviewCandidates(
    [ingredient.id],
    true,
  );
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map());
  const [isSending, setIsSending] = useState(false);
  const [shareRequest, setShareRequest] = useState<ShareRequest | null>(null);

  const mentionable = useMemo<MentionablePerson[]>(
    () =>
      members
        .filter((member) => reviewerUserIds?.has(member.userId))
        .map((member) => ({ name: member.name, userId: member.userId })),
    [members, reviewerUserIds],
  );
  const query = activeMentionQuery(draft);
  const suggestions = useMemo(
    () => (query === null ? [] : matchMentionable(mentionable, query)),
    [mentionable, query],
  );

  const pick = (person: MentionablePerson) => {
    const token = mentionToken(person, mentionable);
    setDraft((text) => insertMention(text, token));
    setPicked((current) => new Map(current).set(person.userId, token));
    setShareRequest(null);
  };

  const send = async (isSharing: boolean) => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    const mentioned = mentionedUserIds(content, picked);
    setIsSending(true);
    try {
      const service = await getMessagesService();
      await service.sendMessage(threadId, {
        content,
        ...(mentioned.length > 0 ? { mentionedUserIds: mentioned } : {}),
        ...(isSharing ? { shareMentioned: true } : {}),
      });
      setDraft('');
      setPicked(new Map());
      setShareRequest(null);
      await queryClient.invalidateQueries({
        queryKey: [REVIEW_THREAD_MESSAGES_QUERY_KEY, threadId],
      });
    } catch (error: unknown) {
      if (
        error instanceof ThreadMentionRefusedError &&
        error.reason === MENTION_NEEDS_SHARE
      ) {
        setShareRequest({ canShare: error.canShare, message: error.message });
      } else if (error instanceof ThreadMentionRefusedError) {
        NotificationsService.getInstance().error(error.message);
      } else {
        logger.error('Failed to send a review thread message', error);
        NotificationsService.getInstance().error(translate('sendFailed'));
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare aria-hidden="true" className="size-3.5" />
        {translate('title')}
      </p>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translate('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
            const author = message.userId
              ? membersById.get(message.userId)
              : undefined;
            const name =
              message.role === 'assistant'
                ? translate('assistant')
                : (author?.name ?? translate('teammate'));
            return (
              <li className="flex gap-2" key={message.id}>
                <Avatar name={name} size="sm" src={author?.avatarUrl} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      {name}
                    </span>
                    {formatTime(message.createdAt)
                      ? ` · ${formatTime(message.createdAt)}`
                      : ''}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-sm">
                    {splitMentions(message.content).map((part, index) =>
                      part.isMention ? (
                        <span
                          className="rounded-sm bg-primary/10 px-1 font-medium text-foreground"
                          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reordered
                          key={index}
                        >
                          {part.text}
                        </span>
                      ) : (
                        part.text
                      ),
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {shareRequest ? (
        <Card
          gap={CardGap.SM}
          padding={CardPadding.SM}
          variant={CardVariant.INSET}
        >
          <p className="text-sm">{shareRequest.message}</p>
          <div className="flex gap-2">
            {shareRequest.canShare ? (
              <Button
                isLoading={isSending}
                onClick={() => {
                  void send(true);
                }}
                size={ButtonSize.SM}
                textTransform="none"
              >
                {translate('shareAndSend')}
              </Button>
            ) : null}
            <Button
              onClick={() => setShareRequest(null)}
              size={ButtonSize.SM}
              textTransform="none"
              variant={ButtonVariant.GHOST}
            >
              {translate('dismiss')}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-1">
        {suggestions.length > 0 ? (
          <div
            aria-label={translate('teammates')}
            className="flex flex-col rounded-lg bg-background-secondary p-1 shadow-border"
            role="listbox"
          >
            {suggestions.map((person) => (
              <Button
                className="justify-start"
                key={person.userId}
                onClick={() => pick(person)}
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.GHOST}
              >
                <Avatar
                  name={person.name}
                  size="2xs"
                  src={membersById.get(person.userId)?.avatarUrl}
                />
                {person.name}
                <span className="text-xs text-muted-foreground">
                  {membersById.get(person.userId)?.roleLabel}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
        <Card
          className="flex flex-row items-end"
          gap={CardGap.SM}
          padding={CardPadding.SM}
          variant={CardVariant.INSET}
        >
          <Textarea
            aria-label={translate('replyLabel')}
            className="min-h-10 flex-1 resize-none border-0 bg-transparent"
            onChange={(event) => {
              setDraft(event.target.value);
              setShareRequest(null);
            }}
            placeholder={translate('replyPlaceholder')}
            value={draft}
          />
          <Button
            ariaLabel={translate('send')}
            isDisabled={!draft.trim()}
            isLoading={isSending && !shareRequest}
            onClick={() => {
              void send(false);
            }}
            size={ButtonSize.ICON}
            variant={ButtonVariant.DEFAULT}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
