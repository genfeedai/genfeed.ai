'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { SocialPlatform } from '@genfeedai/contracts/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type {
  ReplyCampaignDraft,
  ReplyCampaignsPageProps,
} from '@genfeedai/props/social/reply-campaigns-panel.props';
import type { SocialReplyCampaignTransition } from '@services/social/reply-campaigns.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import type { BadgeProps } from '@ui/primitives/badge';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Progress } from '@ui/primitives/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useReplyCampaigns } from './use-reply-campaigns';

/** Reply drip — throttled outbound replies (Messages module). */

const EMPTY_DRAFT: ReplyCampaignDraft = {
  bodyTemplate: '',
  maxPerDay: '50',
  maxPerHour: '10',
  messageType: 'reply',
  minDelaySeconds: '60',
  name: '',
  platform: '',
};

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  cancelled: 'secondary',
  completed: 'success',
  draft: 'outline',
  failed: 'destructive',
  paused: 'warning',
  running: 'info',
};

const MESSAGE_TYPE_OPTIONS: Array<{
  label: string;
  value: ReplyCampaignDraft['messageType'];
}> = [
  { label: 'Public reply', value: 'reply' },
  { label: 'Direct message', value: 'dm' },
];

const MESSAGE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatRunTime(value?: string | null): string {
  if (!value) {
    return 'No activity';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No activity';
  }
  return MESSAGE_TIME.format(date);
}

function getAvailableTransitions(
  status: string,
): SocialReplyCampaignTransition[] {
  switch (status) {
    case 'draft':
      return ['start'];
    case 'running':
      return ['pause', 'cancel'];
    case 'paused':
      return ['resume', 'cancel'];
    default:
      return [];
  }
}

const TRANSITION_LABELS: Record<SocialReplyCampaignTransition, string> = {
  cancel: 'Cancel',
  pause: 'Pause',
  resume: 'Resume',
  start: 'Start',
};

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function describePacing(campaign: SocialReplyCampaignModel): string {
  return `≤${campaign.maxPerHour}/hr · ≤${campaign.maxPerDay}/day · ${campaign.minDelaySeconds}s apart`;
}

function CampaignRow({
  busyCampaignId,
  campaign,
  onTransition,
}: {
  busyCampaignId: string | null;
  campaign: SocialReplyCampaignModel;
  onTransition: ReplyCampaignsPageProps['onTransition'];
}) {
  const transitions = getAvailableTransitions(campaign.status);
  const isBusy = busyCampaignId === campaign.id;

  return (
    <div
      className="space-y-3 rounded-lg border border-border p-3"
      data-testid={`reply-campaign-${campaign.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{campaign.name}</p>
          <p className="mt-0.5 text-xs text-gray-800">
            {describePacing(campaign)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'default'}>
          {campaign.status}
        </Badge>
      </div>

      <Progress value={campaign.progressPercent} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {campaign.sentCount}/{campaign.totalRecipients} sent ·{' '}
          {campaign.skippedCount} skipped · {campaign.failedCount} failed
        </span>
        {campaign.nextRunAt ? (
          <span>Next tick {formatRunTime(campaign.nextRunAt)}</span>
        ) : null}
      </div>

      {campaign.lastError ? (
        <p className="text-xs text-destructive">{campaign.lastError}</p>
      ) : null}

      {transitions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {transitions.map((transition) => (
            <Button
              isDisabled={isBusy}
              isLoading={isBusy}
              key={transition}
              onClick={() => {
                void onTransition(campaign.id, transition);
              }}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
            >
              {TRANSITION_LABELS[transition]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReplyCampaignsContent({
  busyCampaignId,
  campaigns,
  enrollableConversations,
  error,
  isCreating,
  isLoading,
  onCreate,
  onRefresh,
  onTransition,
}: ReplyCampaignsPageProps) {
  const translate = useTranslations('pages.replyDrip');
  const [draft, setDraft] = useState<ReplyCampaignDraft>(EMPTY_DRAFT);

  const platformOptions = useMemo(() => {
    return [
      ...new Set(
        enrollableConversations.map((conversation) => conversation.platform),
      ),
    ];
  }, [enrollableConversations]);

  const selectedPlatform: SocialPlatform | '' =
    draft.platform || (platformOptions[0] ?? '');

  const enrolledIds = useMemo(() => {
    if (!selectedPlatform) {
      return [];
    }

    return enrollableConversations
      .filter((conversation) => conversation.platform === selectedPlatform)
      .map((conversation) => conversation.id);
  }, [enrollableConversations, selectedPlatform]);

  const canCreate =
    Boolean(draft.name.trim()) &&
    Boolean(draft.bodyTemplate.trim()) &&
    Boolean(selectedPlatform) &&
    enrolledIds.length > 0 &&
    !isCreating;

  async function handleCreate() {
    if (!canCreate || !selectedPlatform) {
      return;
    }

    await onCreate({
      bodyTemplate: draft.bodyTemplate.trim(),
      conversationIds: enrolledIds,
      maxPerDay: parsePositiveInt(draft.maxPerDay, 50),
      maxPerHour: parsePositiveInt(draft.maxPerHour, 10),
      messageType: draft.messageType,
      minDelaySeconds: parsePositiveInt(draft.minDelaySeconds, 60),
      name: draft.name.trim(),
      platform: selectedPlatform,
    });

    setDraft(EMPTY_DRAFT);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {translate('title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-foreground/55">
          {translate('description')}
        </p>
      </div>

      {error ? (
        <p
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="reply-campaigns-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Card label="New reply drip" bodyClassName="gap-3 p-4">
        <Input
          label="Name"
          onChange={(event) => {
            setDraft((current) => ({ ...current, name: event.target.value }));
          }}
          value={draft.name}
        />

        <div className="space-y-1.5">
          <p className="text-2xs font-medium text-foreground/54">Reply body</p>
          <Textarea
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                bodyTemplate: event.target.value,
              }));
            }}
            placeholder="Thanks for watching — here is the link you asked for."
            rows={4}
            value={draft.bodyTemplate}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-foreground/54">Platform</p>
            <Select
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  platform: value as SocialPlatform,
                }));
              }}
              value={selectedPlatform}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                {platformOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-foreground/54">
              Message type
            </p>
            <Select
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  messageType: value as ReplyCampaignDraft['messageType'],
                }));
              }}
              value={draft.messageType}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Message type" />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Input
            label="Per hour"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                maxPerHour: event.target.value,
              }));
            }}
            type="number"
            value={draft.maxPerHour}
          />
          <Input
            label="Per day"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                maxPerDay: event.target.value,
              }));
            }}
            type="number"
            value={draft.maxPerDay}
          />
          <Input
            label="Gap (s)"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                minDelaySeconds: event.target.value,
              }));
            }}
            type="number"
            value={draft.minDelaySeconds}
          />
        </div>

        <p
          className="text-xs text-gray-800"
          data-testid="reply-campaign-roster"
        >
          {enrolledIds.length} open conversation
          {enrolledIds.length === 1 ? '' : 's'} on this brand
          {selectedPlatform ? ` · ${selectedPlatform}` : ''} will be enrolled.
        </p>

        <div>
          <Button
            isDisabled={!canCreate}
            isLoading={isCreating}
            onClick={() => {
              void handleCreate();
            }}
            size={ButtonSize.SM}
          >
            Create drip
          </Button>
        </div>
      </Card>

      <Card
        label="Reply drips"
        bodyClassName="gap-3 p-4"
        headerAction={
          <Button
            icon={<RefreshCw className="size-4" />}
            isDisabled={isLoading}
            isLoading={isLoading}
            onClick={onRefresh}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          >
            Refresh
          </Button>
        }
      >
        {campaigns.length === 0 && !isLoading ? (
          <p className="text-xs text-gray-800">
            No reply drips yet. Sync messages so open conversations are
            available to enroll, then create one above.
          </p>
        ) : null}

        {campaigns.map((campaign) => (
          <CampaignRow
            busyCampaignId={busyCampaignId}
            campaign={campaign}
            key={campaign.id}
            onTransition={onTransition}
          />
        ))}
      </Card>
    </div>
  );
}

export default function ReplyCampaignsPage() {
  const replyCampaigns = useReplyCampaigns();

  return (
    <Container className="py-5 sm:py-6">
      <ReplyCampaignsContent
        busyCampaignId={replyCampaigns.busyCampaignId}
        campaigns={replyCampaigns.campaigns}
        enrollableConversations={replyCampaigns.enrollableConversations}
        error={replyCampaigns.error}
        isCreating={replyCampaigns.isCreating}
        isLoading={replyCampaigns.isLoading}
        onCreate={replyCampaigns.createCampaign}
        onRefresh={replyCampaigns.refresh}
        onTransition={replyCampaigns.transitionCampaign}
      />
    </Container>
  );
}
