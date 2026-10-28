import type {
  EvidenceLabelProps,
  SourceEvidenceRowsProps,
} from '@props/pages/brand-kit-review.props';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import {
  EVIDENCE_KIND_BADGE_VARIANTS,
  formatConfidence,
} from './brand-kit-review.helpers';

export function EvidenceLabel({ kind }: EvidenceLabelProps) {
  return <Badge variant={EVIDENCE_KIND_BADGE_VARIANTS[kind]}>{kind}</Badge>;
}

export default function SourceEvidenceRows({
  evidence,
}: SourceEvidenceRowsProps) {
  const translate = useTranslations('pages.brandKitReview');

  if (evidence.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label={translate('sourceEvidence')}
      className="mt-3 divide-y divide-border"
    >
      {evidence.map((source, index) => {
        const confidenceLabel = formatConfidence(source.confidence);
        return (
          <li
            className="grid min-h-8 items-center gap-1 py-1.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
            key={`${source.sourceType}-${source.sourceId ?? source.url ?? index}`}
          >
            <div className="min-w-0">
              {source.url ? (
                <a
                  className="block truncate rounded-sm font-medium text-foreground/80 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href={source.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {source.label}
                </a>
              ) : (
                <span className="font-medium text-foreground/80">
                  {source.label}
                </span>
              )}
              {source.excerpt ? (
                <p className="truncate text-2xs text-muted-foreground">
                  {source.excerpt}
                </p>
              ) : null}
            </div>
            <span className="font-mono text-2xs uppercase text-muted-foreground">
              {confidenceLabel
                ? `${source.sourceType} · ${confidenceLabel}`
                : source.sourceType}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
