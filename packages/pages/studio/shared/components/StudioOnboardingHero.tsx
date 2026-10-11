import type { StudioOnboardingHeroProps } from '@genfeedai/props/studio/studio-presets.props';
import Card from '@ui/card/Card';
import type { ReactElement } from 'react';

/** Headline, one-line value proposition and a decorative preview. */
export default function StudioOnboardingHero({
  actions,
  description,
  illustration,
  testId,
  title,
}: StudioOnboardingHeroProps): ReactElement {
  return (
    <Card bodyClassName="gap-4 p-5" className="w-full" data-testid={testId}>
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {illustration}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  );
}
