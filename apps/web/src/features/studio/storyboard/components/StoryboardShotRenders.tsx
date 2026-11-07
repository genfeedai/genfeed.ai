'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  StoryboardShotRender,
  StoryboardShotRenderStage,
} from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Clapperboard, Film, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StoryboardShotRendersProps } from '@/features/studio/props/storyboard.props';

const STATE_LABELS = {
  pending: 'statePending',
  submitted: 'stateSubmitted',
  ready: 'stateReady',
  failed: 'stateFailed',
} as const satisfies Record<StoryboardShotRender['state'], string>;

function isLive(render?: StoryboardShotRender): boolean {
  return render?.state === 'pending' || render?.state === 'submitted';
}

/** The draft and final video of one approved shot, with the next paid step. */
export default function StoryboardShotRenders({
  ordinal,
  draft,
  final,
  videoUrls,
  isDisabled,
  onRender,
}: StoryboardShotRendersProps) {
  const translate = useTranslations('pages.studioStoryboard.renders');
  const canPromote =
    draft?.state === 'ready' &&
    draft.isCurrent &&
    !(final?.state === 'ready' && final.isCurrent);
  const stages: ReadonlyArray<{
    stage: StoryboardShotRenderStage;
    render?: StoryboardShotRender;
  }> = [
    { stage: 'draft', render: draft },
    { stage: 'final', render: final },
  ];

  return (
    <div
      aria-label={translate('title')}
      className="flex flex-col gap-3 border-t border-border px-4 py-3"
      role="group"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {stages.map(({ stage, render }) => {
          const url = render?.assetId ? videoUrls[render.assetId] : undefined;
          return (
            <div key={stage} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">
                  {translate(stage)}
                </span>
                <Badge variant="secondary">
                  {render
                    ? translate(STATE_LABELS[render.state])
                    : translate('notRendered')}
                </Badge>
              </div>
              {render?.state === 'ready' && url ? (
                <AgentMediaArtifactPreview
                  displayMode="featured"
                  assets={[
                    {
                      kind: 'video',
                      url,
                      title: translate('videoAlt', {
                        stage: translate(stage),
                        ordinal,
                      }),
                    },
                  ]}
                />
              ) : null}
              {render && !render.isCurrent ? (
                <p className="text-xs text-warning">
                  {translate('earlierVersion')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Clapperboard className="size-4" />}
          isDisabled={isDisabled || isLive(draft)}
          label={draft ? translate('redoDraft') : translate('renderDraft')}
          onClick={() => onRender('draft')}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          icon={
            canPromote ? (
              <Sparkles className="size-4" />
            ) : (
              <Film className="size-4" />
            )
          }
          isDisabled={isDisabled || isLive(final)}
          label={
            canPromote
              ? translate('promote')
              : final
                ? translate('redoFinal')
                : translate('renderFinal')
          }
          onClick={() => onRender('final')}
          size={ButtonSize.SM}
          variant={canPromote ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY}
        />
      </div>
    </div>
  );
}
