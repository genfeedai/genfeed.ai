import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { HiCheckCircle, HiMegaphone, HiSparkles } from 'react-icons/hi2';

interface BrandVoiceProfileCardProps {
  action: AgentUiAction;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
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
  const [isSaved, setIsSaved] = useState(false);
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
    if (!approveCta?.action || !onUiAction || isSaving || isSaved) {
      return;
    }

    setIsSaving(true);

    try {
      await onUiAction(approveCta.action, approveCta.payload);
      setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  }, [approveCta?.action, approveCta?.payload, isSaved, isSaving, onUiAction]);

  if (isSaved) {
    return (
      <div className="my-2 border border-emerald-500/20 bg-background p-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <HiCheckCircle className="h-5 w-5" />
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
        <HiMegaphone className="h-5 w-5 text-amber-500" />
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
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tone
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.tone || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Style
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.style || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Voice Source
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.canonicalSource || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Audience
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.audience.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Messaging Pillars
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.messagingPillars.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Approved Hooks
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.approvedHooks.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Core Values
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.values.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Banned Phrases
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.bannedPhrases.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Avoid
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.doNotSoundLike.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Writing Rules
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.writingRules.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Exemplars
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile.exemplarTexts.join(', ') || 'Not set'}
          </p>
        </div>

        <div className="border border-border bg-card/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
          isDisabled={isSaving}
          isLoading={isSaving}
          onClick={() => {
            void handleApprove();
          }}
          icon={<HiSparkles className="h-4 w-4" />}
          className="mt-4 w-full justify-center"
        >
          {isSaving ? 'Saving...' : approveCta.label}
        </Button>
      ) : null}
    </div>
  );
}
