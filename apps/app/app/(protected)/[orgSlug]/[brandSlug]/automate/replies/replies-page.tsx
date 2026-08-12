'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { MessageCircleReply, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type ReplyIntent = 'thanks' | 'question' | 'troll' | 'spam' | 'default';

type InboxItem = {
  authorDisplayName?: string;
  authorId: string;
  authorUsername: string;
  commentId: string;
  commentText: string;
  commentUrl?: string;
  createdAt: string;
  intent: ReplyIntent;
  intentLabel: string;
  parentPostId: string;
  parentPostPreview?: string;
  parentPostUrl?: string;
  shouldSkipAuto: boolean;
};

type DraftState = Record<string, string>;
type IntentState = Record<string, ReplyIntent>;

const INTENT_OPTIONS: Array<{ label: string; value: ReplyIntent }> = [
  { label: 'Thanks', value: 'thanks' },
  { label: 'Question', value: 'question' },
  { label: 'Troll', value: 'troll' },
  { label: 'Default', value: 'default' },
  { label: 'Spam (skip auto)', value: 'spam' },
];

function intentBadgeVariant(
  intent: ReplyIntent,
): 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'info' {
  switch (intent) {
    case 'thanks':
      return 'success';
    case 'question':
      return 'info';
    case 'troll':
      return 'warning';
    case 'spam':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function RepliesPage() {
  const { brand, isLoading: isBrandLoading } = useBrandDetail();
  const getReplyBotService = useAuthedService(ReplyBotConfigsService);
  const abortRef = useRef<AbortController | null>(null);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [username, setUsername] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [botConfigId, setBotConfigId] = useState<string | undefined>();
  const [drafts, setDrafts] = useState<DraftState>({});
  const [intents, setIntents] = useState<IntentState>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const brandId = brand?.id;

  const loadInbox = useCallback(async () => {
    if (!brandId) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      const service = await getReplyBotService();
      const result = await service.getAuthorReplyInbox({
        brandId,
        hours: 24,
      });
      if (controller.signal.aborted) {
        return;
      }
      const nextItems = (result.items ?? []) as InboxItem[];
      setItems(nextItems);
      setUsername(result.username);
      setIntents((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!next[item.commentId]) {
            next[item.commentId] = item.intent;
          }
        }
        return next;
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      logger.error('Replies inbox failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not load replies inbox',
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [brandId, getReplyBotService]);

  useEffect(() => {
    void loadInbox();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadInbox]);

  async function handleEnableAuto() {
    if (!brandId) {
      return;
    }
    setIsEnabling(true);
    try {
      const service = await getReplyBotService();
      const result = await service.ensureAuthorResponder({
        brandId,
        isActive: true,
      });
      setIsActive(result.isActive);
      setBotConfigId(result.botConfigId);
      toast.success(
        result.created ? 'Auto-replies enabled for X' : 'Auto-replies updated',
      );
      await loadInbox();
    } catch (error: unknown) {
      logger.error('Enable auto-replies failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Connect X for this brand first',
      );
    } finally {
      setIsEnabling(false);
    }
  }

  async function handleDraft(item: InboxItem) {
    if (!brandId) {
      return;
    }
    setBusyId(item.commentId);
    try {
      const service = await getReplyBotService();
      const intent = intents[item.commentId] ?? item.intent;
      const result = await service.draftAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentId: item.commentId,
        commentText: item.commentText,
        intent,
        parentPostPreview: item.parentPostPreview,
      });
      setDrafts((prev) => ({ ...prev, [item.commentId]: result.draft }));
      if (result.intent) {
        setIntents((prev) => ({
          ...prev,
          [item.commentId]: result.intent as ReplyIntent,
        }));
      }
      if (result.harnessApplied) {
        toast.success(`Draft ready (${result.intentLabel})`);
      } else if (result.intent === 'spam') {
        toast.message('Marked spam — auto draft skipped');
      }
    } catch (error: unknown) {
      logger.error('Draft reply failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not draft reply',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(item: InboxItem) {
    if (!brandId) {
      return;
    }
    setBusyId(item.commentId);
    try {
      const service = await getReplyBotService();
      const intent = intents[item.commentId] ?? item.intent;
      const result = await service.sendAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentAuthorId: item.authorId,
        commentId: item.commentId,
        commentText: item.commentText,
        intent,
        parentPostId: item.parentPostId,
        parentPostPreview: item.parentPostPreview,
        replyText: drafts[item.commentId],
      });
      if (!result.success) {
        throw new Error(result.error || 'Send failed');
      }
      toast.success('Reply sent');
      setItems((prev) =>
        prev.filter((row) => row.commentId !== item.commentId),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.commentId];
        return next;
      });
    } catch (error: unknown) {
      logger.error('Send reply failed', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not send reply',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (isBrandLoading || !brandId) {
    return <Loading />;
  }

  return (
    <Container className="flex flex-col gap-6 py-6">
      <Card
        label="Replies"
        description="Reply to comments on your posts (X). Intent modes: thanks, questions, trolls (controlled wit), skip spam. Only last 24 hours."
        bodyClassName="gap-4 p-4"
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isEnabling}
              onClick={() => void handleEnableAuto()}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            >
              {isEnabling ? 'Enabling…' : 'Enable auto-replies'}
            </Button>
            <Button
              disabled={isLoading}
              onClick={() => void loadInbox()}
              size={ButtonSize.SM}
              variant={ButtonVariant.OUTLINE}
            >
              <RefreshCw className="size-4" />
              Refresh inbox
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <MessageCircleReply className="mr-1 size-3" />
            max 24h
          </Badge>
          {username ? (
            <Badge variant="outline">@{username.replace(/^@/, '')}</Badge>
          ) : null}
          {isActive ? (
            <Badge variant="success">auto on</Badge>
          ) : (
            <Badge variant="warning">manual or enable auto</Badge>
          )}
          {botConfigId ? (
            <Badge variant="outline">bot {botConfigId.slice(0, 8)}…</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Official X reads first (Apify only if needed). Drafts use brand
          harness + intent persona.
        </p>
      </Card>

      {isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Card
          label="Inbox clear"
          description="No unreplied comments in the last 24 hours — connect X and post, or check back after people reply."
          bodyClassName="p-4"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => {
            const intent = intents[item.commentId] ?? item.intent;
            return (
              <Card
                key={item.commentId}
                label={`@${item.authorUsername.replace(/^@/, '')}`}
                description={
                  item.parentPostPreview
                    ? `On: ${item.parentPostPreview}`
                    : 'On your post'
                }
                bodyClassName="gap-3 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={intentBadgeVariant(intent)}>
                    {item.intentLabel || intent}
                  </Badge>
                  {item.shouldSkipAuto ? (
                    <Badge variant="destructive">skip auto</Badge>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {item.commentText}
                </p>
                <Select
                  value={intent}
                  onValueChange={(value) =>
                    setIntents((prev) => ({
                      ...prev,
                      [item.commentId]: value as ReplyIntent,
                    }))
                  }
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Intent" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={drafts[item.commentId] ?? ''}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [item.commentId]: event.target.value,
                    }))
                  }
                  placeholder="Your reply…"
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busyId === item.commentId}
                    onClick={() => void handleDraft(item)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.OUTLINE}
                  >
                    Draft
                  </Button>
                  <Button
                    disabled={busyId === item.commentId}
                    onClick={() => void handleSend(item)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.DEFAULT}
                  >
                    Send reply
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
