'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { SocialPlatform } from '@genfeedai/interfaces';
import type { SocialReplyCampaignModel } from '@genfeedai/models/social/social-reply-campaign.model';
import type {
  ReplyCampaignDraft,
  ReplyCampaignsPanelProps,
} from '@genfeedai/props/social/reply-campaigns-panel.props';
import type { SocialReplyCampaignTransition } from '@services/social/reply-campaigns.service';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { Textarea } from '@ui/primitives/textarea';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMessageTime } from './messages-page.helpers';

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

/**
 * Transitions the campaign accepts right now. A terminal campaign accepts none,
 * which is why the row can end up with an empty action group.
 */
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
  onTransition: ReplyCampaignsPanelProps['onTransition'];
}) {
  const transitions = getAvailableTransitions(campaign.status);
  const isBusy = busyCampaignId === campaign.id;

  return (
    <div
      className="space-y-3 rounded-lg border border-white/8 p-3"
      data-testid={`reply-campaign-${campaign.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{campaign.name}</p>
          <p className="mt-0.5 text-xs text-white/38">
            {describePacing(campaign)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'default'}>
          {campaign.status}
        </Badge>
      </div>

      <Progress value={campaign.progressPercent} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/54">
        <span>
          {campaign.sentCount}/{campaign.totalRecipients} sent ·{' '}
          {campaign.skippedCount} skipped · {campaign.failedCount} failed
        </span>
        {campaign.nextRunAt ? (
          <span>Next tick {formatMessageTime(campaign.nextRunAt)}</span>
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

export default function MessagesReplyCampaignsPanel({
  busyCampaignId,
  campaigns,
  enrollableConversations,
  error,
  isCreating,
  isLoading,
  isOpen,
  onCreate,
  onOpenChange,
  onRefresh,
  onTransition,
}: ReplyCampaignsPanelProps) {
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
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>Reply campaigns</SheetTitle>
          <SheetDescription>
            Campaigns drip one reply at a time inside the pacing you set. Pause,
            resume, or cancel at any point — a resumed campaign continues from
            the recipient it stopped on.
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <p
            className="mt-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive"
            data-testid="reply-campaigns-error"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          <p className="text-[11px] font-medium text-foreground/54">
            New campaign
          </p>

          <Input
            label="Campaign name"
            onChange={(event) => {
              setDraft((current) => ({ ...current, name: event.target.value }));
            }}
            value={draft.name}
          />

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-foreground/54">
              Reply body
            </p>
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

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-foreground/54">
              Platform
            </p>
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
            <p className="text-[11px] font-medium text-foreground/54">
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
            className="text-xs text-white/38"
            data-testid="reply-campaign-roster"
          >
            {enrolledIds.length} conversation
            {enrolledIds.length === 1 ? '' : 's'} from the current filters will
            be enrolled.
          </p>

          <Button
            isDisabled={!canCreate}
            isLoading={isCreating}
            onClick={() => {
              void handleCreate();
            }}
            size={ButtonSize.SM}
          >
            Create campaign
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <p className="text-[11px] font-medium text-foreground/54">
            Campaigns
          </p>
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
        </div>

        <div className="mt-3 space-y-3 pb-6">
          {campaigns.length === 0 && !isLoading ? (
            <p className="text-xs text-white/38">
              No campaigns yet. Filter the inbox down to the conversations you
              want to reach, then create one above.
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
