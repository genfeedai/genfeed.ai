import { getExpertPositioningRatingLabel } from '@genfeedai/contracts/constants';
import type { HarnessPositioningScorecardProps } from '@props/settings/harness.props';
import Card from '@ui/card/Card';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Expert Path positioning scorecard, shown on the brand harness settings page
 * whenever the loaded harness profile carries a server-computed `positioning`
 * score. Absent entirely when the profile has never been scored.
 */
export default function HarnessPositioningScorecard({
  positioning,
  interviewHref,
}: HarnessPositioningScorecardProps) {
  const translate = useTranslations(
    'pages.brandHarnessSettings.positioningScorecard',
  );

  const weakestDimension = positioning.dimensions.find(
    (dimension) => dimension.key === positioning.weakestDimension,
  );

  return (
    <Card
      bodyClassName="gap-4 p-4"
      description={translate('description')}
      label={translate('title')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold text-foreground">
          {translate('scoreValue', {
            score: Math.round(positioning.totalScore),
          })}
        </span>
        <Badge variant="outline">
          {getExpertPositioningRatingLabel(positioning.rating)}
        </Badge>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {positioning.dimensions.map((dimension) => (
          <div key={dimension.key}>
            <dt className="text-xs text-muted-foreground">{dimension.label}</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {translate('dimensionScore', { score: dimension.score })}
            </dd>
          </div>
        ))}
      </dl>

      {weakestDimension ? (
        <Alert variant="warning">
          <AlertTitle>
            {translate('weakestTitle', { label: weakestDimension.label })}
          </AlertTitle>
          <AlertDescription>
            <p>{weakestDimension.followUpQuestion}</p>
            <Link className="mt-2 inline-block underline" href={interviewHref}>
              {translate('interviewLink')}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
    </Card>
  );
}
