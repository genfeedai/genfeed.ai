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
import { Textarea } from '@ui/primitives/textarea';
import { MessageCircleReply, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type InboxItem = {
  authorDisplayName?: string;
  authorId: string;
  authorUsername: string;
  commentId: string;
  commentText: string;
  commentUrl?: string;
  createdAt: string;
  parentPostId: string;
  parentPostPreview?: string;
  parentPostUrl?: string;
};

type DraftState = Record<string, string>;

export default function AuthorRepliesPage() {
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
      setItems(result.items ?? []);
      setUsername(result.username);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      logger.error('Author reply inbox failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not load author reply inbox',
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

  async function handleEnableLoop() {
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
        result.created
          ? 'Author reply loop enabled for X'
          : 'Author reply loop updated',
      );
      if (result.isActive && result.botConfigId) {
        // Kick polling so open comments start processing.
        // credential is resolved server-side on cron; optional trigger needs id.
      }
      await loadInbox();
    } catch (error: unknown) {
      logger.error('Enable author responder failed', error);
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
      const result = await service.draftAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentId: item.commentId,
        commentText: item.commentText,
        parentPostPreview: item.parentPostPreview,
      });
      setDrafts((prev) => ({ ...prev, [item.commentId]: result.draft }));
      if (result.harnessApplied) {
        toast.success('Draft ready (harness applied)');
      }
    } catch (error: unknown) {
      logger.error('Draft author reply failed', error);
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
      const result = await service.sendAuthorReply({
        brandId,
        commentAuthor: item.authorUsername,
        commentAuthorId: item.authorId,
        commentId: item.commentId,
        commentText: item.commentText,
        parentPostId: item.parentPostId,
        parentPostPreview: item.parentPostPreview,
        replyText: drafts[item.commentId],
      });
      if (!result.success) {
        throw new Error(result.error || 'Send failed');
      }
      toast.success('Author reply sent — closed loop recorded');
      setItems((prev) =>
        prev.filter((row) => row.commentId !== item.commentId),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.commentId];
        return next;
      });
    } catch (error: unknown) {
      logger.error('Send author reply failed', error);
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
        label="Author replies (X)"
        description="Close the conversation loop on *your* posts — the signal X ranks highest. Not reply-guy. Not @grok."
        bodyClassName="gap-4 p-4"
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isEnabling}
              onClick={() => void handleEnableLoop()}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            >
              {isEnabling ? 'Enabling…' : 'Enable auto author replies'}
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
            last 24h
          </Badge>
          {username ? (
            <Badge variant="outline">@{username.replace(/^@/, '')}</Badge>
          ) : null}
          {isActive ? (
            <Badge variant="success">auto loop active</Badge>
          ) : (
            <Badge variant="warning">manual or enable auto</Badge>
          )}
          {botConfigId ? (
            <Badge variant="outline">bot {botConfigId.slice(0, 8)}…</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Drafts use the brand harness + platform-x rules. Sending records an
          author closed loop so winners promotion prefers conversation posts.
        </p>
      </Card>

      {isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Card
          label="Inbox clear"
          description="No unreplied comments on your recent X posts in the last 24 hours — or connect X and post first."
          bodyClassName="p-4"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
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
              <p className="text-sm whitespace-pre-wrap">{item.commentText}</p>
              <Textarea
                value={drafts[item.commentId] ?? ''}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [item.commentId]: event.target.value,
                  }))
                }
                placeholder="Author reply draft…"
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busyId === item.commentId}
                  onClick={() => void handleDraft(item)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.OUTLINE}
                >
                  Draft with harness
                </Button>
                <Button
                  disabled={busyId === item.commentId}
                  onClick={() => void handleSend(item)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                >
                  Send as author
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
