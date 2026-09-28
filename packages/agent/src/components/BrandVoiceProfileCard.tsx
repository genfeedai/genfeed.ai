import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, Megaphone, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useMemo } from 'react';

interface BrandVoiceProfileCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

function readStringList(value: unknown, fallback?: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return fallback ?? [];
}

export function BrandVoiceProfileCard({
  action,
  onUiAction,
}: BrandVoiceProfileCardProps): ReactElement {
  const translate = useTranslations('agent.brandVoiceProfileCard');
  const request = useAgentUiActionRequest(onUiAction);
  const profile = useMemo(() => {
    const data = action.data ?? {};
    const rawProfile =
      data.voiceProfile && typeof data.voiceProfile === 'object'
        ? (data.voiceProfile as Record<string, unknown>)
        : {};
    return {
      approvedHooks: readStringList(rawProfile.approvedHooks, []),
      audience: readStringList(rawProfile.audience, []),
      bannedPhrases: readStringList(rawProfile.bannedPhrases, []),
      canonicalSource:
        typeof rawProfile.canonicalSource === 'string'
          ? rawProfile.canonicalSource
          : '',
      doNotSoundLike: readStringList(rawProfile.doNotSoundLike, []),
      exemplarTexts: readStringList(rawProfile.exemplarTexts, []),
      messagingPillars: readStringList(rawProfile.messagingPillars, []),
      sampleOutput:
        typeof rawProfile.sampleOutput === 'string'
          ? rawProfile.sampleOutput
          : '',
      style: typeof rawProfile.style === 'string' ? rawProfile.style : '',
      tone: typeof rawProfile.tone === 'string' ? rawProfile.tone : '',
      values: readStringList(rawProfile.values, []),
      writingRules: readStringList(rawProfile.writingRules, []),
    };
  }, [action.data]);

  const approveCta = action.ctas?.find((cta) => cta.action);
  const phase = approveCta?.action
    ? request.getPhase(approveCta.action, approveCta.payload)
    : 'idle';
  const hasSaved = phase === 'completed' || action.status === 'completed';
  const isInFlight = phase === 'running' || phase === 'awaiting';
  const failure =
    phase === 'failed' && approveCta?.action
      ? request.getError(approveCta.action, approveCta.payload)
      : null;

  const handleApprove = useCallback(async () => {
    if (!approveCta?.action || !onUiAction || isInFlight || hasSaved) {
      return;
    }
    const outcome = await request.submit(approveCta.action, approveCta.payload);
    if (outcome === true) {
      useAgentChatStore.getState().setUiActionStatus(action.id, 'completed');
    }
  }, [
    action.id,
    approveCta?.action,
    approveCta?.payload,
    hasSaved,
    isInFlight,
    onUiAction,
    request,
  ]);

  if (hasSaved) {
    return (
      <div className="my-2 border border-success/20 bg-background p-4">
        <div className="flex items-center gap-2 text-success">
          <CircleCheck className="size-5" />
          <span className="text-sm font-medium">
            Brand voice saved to this brand.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone className="size-5 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Brand Voice Draft'}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-4 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      <div className="grid gap-3">
        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Tone
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.tone || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Style
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.style || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Voice Source
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.canonicalSource || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Audience
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.audience.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Messaging Pillars
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.messagingPillars.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Approved Hooks
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.approvedHooks.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Core Values
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.values.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Banned Phrases
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.bannedPhrases.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Avoid
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.doNotSoundLike.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Writing Rules
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.writingRules.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Exemplars
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.exemplarTexts.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Sample Output
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {profile.sampleOutput || 'Not set'}
          </p>
        </div>
      </div>

      {approveCta?.action ? (
        <Button
          variant={ButtonVariant.DEFAULT}
          isDisabled={isInFlight}
          isLoading={isInFlight}
          onClick={() => {
            void handleApprove();
          }}
          icon={<Sparkles className="size-4" />}
          className="mt-4 w-full justify-center"
        >
          {isInFlight ? 'Saving...' : approveCta.label}
        </Button>
      ) : null}
      {phase === 'awaiting' ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {translate('awaitingResult')}
        </p>
      ) : null}
      {failure ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
