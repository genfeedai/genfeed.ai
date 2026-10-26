import { ButtonVariant } from '@genfeedai/contracts';
import type { VoiceCatalogListProps } from '@props/library/voice-catalog-list.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function VoiceCatalogList({
  children,
  generateHref,
  hasActiveFilters,
  onClearFilters,
  onCloneVoice,
  voices,
}: VoiceCatalogListProps) {
  const translate = useTranslations('common.actions');

  if (voices.length === 0) {
    return (
      <CardEmpty
        label={
          hasActiveFilters
            ? 'No voices match the current filters'
            : 'No voices available yet'
        }
        description={
          hasActiveFilters
            ? 'Clear the current filters or clone a new voice sample to populate this library.'
            : 'Generate a voice with Agent or clone one from an uploaded or recorded sample.'
        }
        actions={
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {hasActiveFilters ? (
              <Button onClick={onClearFilters} withWrapper={false}>
                {translate('clearFilters')}
              </Button>
            ) : null}
            {generateHref ? (
              <Button asChild withWrapper={false}>
                <Link href={generateHref}>{translate('generateVoice')}</Link>
              </Button>
            ) : null}
            <Button
              onClick={onCloneVoice}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              {translate('cloneVoice')}
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <ul className="space-y-3" data-testid="voice-catalog-list">
      {children}
    </ul>
  );
}
