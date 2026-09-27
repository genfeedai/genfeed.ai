import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { CircleCheck, Megaphone, Sparkles } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

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
  const [isSaving, setIsSaving] = useState(false);
  const [isAwaitingResult, setIsAwaitingResult] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const hasSaved = isSaved || action.status === 'completed';
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

  const handleApprove = useCallback(async () => {
    if (
      !approveCta?.action ||
      !onUiAction ||
      isSaving ||
      isAwaitingResult ||
      hasSaved
    ) {
      return;
    }

    setIsSaving(true);

    try {
      const outcome = await onUiAction(approveCta.action, approveCta.payload);
      // Accepted but unconfirmed: the save may still land, so neither claim
      // it nor offer a second submission.
      if (outcome === 'pending') {
        setIsAwaitingResult(true);
        return;
      }
      if (outcome !== false) {
        useAgentChatStore.getState().setUiActionStatus(action.id, 'completed');
        setIsSaved(true);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    action.id,
    approveCta?.action,
    approveCta?.payload,
    hasSaved,
    isAwaitingResult,
    isSaving,
    onUiAction,
  ]);
  const isInFlight = isSaving || isAwaitingResult;

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
      {isAwaitingResult ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Still saving. The result appears in this thread when it finishes.
        </p>
      ) : null}
    </div>
  );
}
