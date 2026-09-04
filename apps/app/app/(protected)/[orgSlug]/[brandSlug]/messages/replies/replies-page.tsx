'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
  isYouTubePlatform,
  Platform,
  parsePlatform,
} from '@genfeedai/contracts';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePlatformOAuthConnect } from '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import Card from '@ui/card/Card';
import { EmptyState } from '@ui/card/EmptyState';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

const REPLIES_DESCRIPTION =
  'Answer people who comment on your posts. Draft replies in your brand voice, or turn on auto-replies for new comments.';

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
  const translate = useTranslations('common.automation.replies');
  const router = useRouter();
  const { orgSlug } = useOrgUrl();
  const { brandId: scopedBrandId, pageScope } = useCollectionScope();
  const { brand, isLoading: isBrandLoading } = useBrandDetail();
  const getReplyBotService = useAuthedService((token: string) =>
    ReplyBotConfigsService.getInstance(token),
  );
  const connectPlatform = usePlatformOAuthConnect({ brandId: brand?.id });
  const [isConnecting, setIsConnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [username, setUsername] = useState<string | undefined>();
  const [inboxPlatform, setInboxPlatform] = useState<
    Platform.TWITTER | Platform.YOUTUBE
  >(Platform.TWITTER);
  const [platformLabel, setPlatformLabel] = useState('X');
  const [isLoading, setIsLoading] = useState(true);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [intents, setIntents] = useState<IntentState>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);

  const brandId = scopedBrandId;

  const loadInbox = useCallback(async () => {
    if (!brandId) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setInboxError(null);
    try {
      const service = await getReplyBotService();
      const result = await service.getAuthorReplyInbox({
        brandId,
        hours: isYouTubePlatform(inboxPlatform) ? 48 : 24,
        platform: inboxPlatform,
      });
      if (controller.signal.aborted) {
        return;
      }
      const nextItems = (result.items ?? []) as InboxItem[];
      setItems(nextItems);
      setUsername(result.username);
      setPlatformLabel(formatPlatformLabel(result.platform) ?? 'X');
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
      const message =
        error instanceof Error ? error.message : 'Could not load replies inbox';
      logger.error('Replies inbox failed', error);
      setItems([]);
      setInboxError(message);
      toast.error(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [brandId, getReplyBotService, inboxPlatform]);

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
        platform: inboxPlatform,
      });
      setIsActive(result.isActive);
      const label = formatPlatformLabel(inboxPlatform) ?? 'X';
      toast.success(
        result.created
          ? `Auto-replies enabled for ${label}`
          : 'Auto-replies updated',
      );
      await loadInbox();
    } catch (error: unknown) {
      logger.error('Enable auto-replies failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : isYouTubePlatform(inboxPlatform)
            ? 'Connect YouTube for this brand first'
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
        platform: inboxPlatform,
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
        platform: inboxPlatform,
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

  async function handleConnectPlatform() {
    if (!brandId) {
      return;
    }
    setIsConnecting(true);
    try {
      await connectPlatform(inboxPlatform);
    } catch (error: unknown) {
      logger.error('Replies platform connect failed', error);
      toast.error(
        error instanceof Error
          ? error.message
          : isYouTubePlatform(inboxPlatform)
            ? 'Could not connect YouTube'
            : 'Could not connect X',
      );
      setIsConnecting(false);
    }
  }

  if (pageScope === 'org' && !brandId) {
    return (
      <Container label="Replies" description={REPLIES_DESCRIPTION}>
        <EmptyState
          title="Choose a brand to review replies"
          description="Replies belong to a brand's connected social accounts. Select a brand in the top bar to open its inbox."
          icon={MessageCircleReply}
          action={{
            label: 'Manage brands',
            onClick: () => router.push(`/${orgSlug}/~/settings/brands`),
            variant: ButtonVariant.SECONDARY,
          }}
        />
      </Container>
    );
  }

  if (isBrandLoading || !brandId) {
    return <Loading />;
  }

  return (
    <Container
      className="flex flex-col gap-6"
      label="Replies"
      description={REPLIES_DESCRIPTION}
    >
      <Card
        label="Inbox controls"
        bodyClassName="gap-4 p-4"
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={isEnabling}
              onClick={() => void handleEnableAuto()}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            >
              {isEnabling ? 'Enabling…' : 'Enable auto-replies'}
            </Button>
            <Button
              isDisabled={isLoading}
              onClick={() => void loadInbox()}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <RefreshCw className="size-4" />
              {translate('actions.refresh')}
            </Button>
          </div>
        }
      >
        <div className="flex max-w-xs flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {translate('platform.label')}
          </span>
          <Select
            value={inboxPlatform}
            onValueChange={(value) => {
              const platform = parsePlatform(value);
              if (
                platform === Platform.TWITTER ||
                platform === Platform.YOUTUBE
              ) {
                setInboxPlatform(platform);
                setItems([]);
                setInboxError(null);
              }
            }}
          >
            <SelectTrigger aria-label="Replies platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={Platform.TWITTER}>
                {translate('platform.twitter')}
              </SelectItem>
              <SelectItem value={Platform.YOUTUBE}>
                {translate('platform.youtube')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <MessageCircleReply className="mr-1 size-3" />
            {platformLabel}
          </Badge>
          {username ? (
            <Badge variant="outline">@{username.replace(/^@/, '')}</Badge>
          ) : null}
          {isActive ? (
            <Badge variant="success">{translate('status.on')}</Badge>
          ) : (
            <Badge variant="warning">{translate('status.off')}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {translate('description')}
        </p>
        {inboxError ? (
          <p className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {inboxError}
          </p>
        ) : null}
      </Card>

      {isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Card
          label={inboxError ? 'Inbox unavailable' : 'Inbox clear'}
          description={
            inboxError
              ? inboxError
              : isYouTubePlatform(inboxPlatform)
                ? 'No unreplied YouTube comments in the last 48 hours — connect YouTube for this brand, or check back after people comment.'
                : 'No unreplied comments in the last 24 hours — connect X and post, or check back after people reply.'
          }
          bodyClassName="flex flex-col gap-3 p-4"
          headerAction={
            <Button
              isDisabled={isConnecting}
              onClick={() => void handleConnectPlatform()}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              {isConnecting
                ? 'Connecting…'
                : isYouTubePlatform(inboxPlatform)
                  ? 'Connect YouTube'
                  : 'Connect X'}
            </Button>
          }
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
                    <Badge variant="destructive">
                      {translate('status.skipAuto')}
                    </Badge>
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
                    isDisabled={busyId === item.commentId}
                    onClick={() => void handleDraft(item)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    {translate('actions.draft')}
                  </Button>
                  <Button
                    isDisabled={busyId === item.commentId}
                    onClick={() => void handleSend(item)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.DEFAULT}
                  >
                    {translate('actions.send')}
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
