'use client';

import type { BrandOsGenerationRulesReviewProps } from '@props/pages/brand-os-settings.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

const sections = [
  'facts',
  'approvedLiterals',
  'palette',
  'typography',
  'mandatory',
  'avoid',
  'examples',
  'assets',
  'evidence',
] as const;
const mediaSections = new Set([
  'facts',
  'palette',
  'typography',
  'mandatory',
  'avoid',
  'assets',
]);

export default function BrandOsGenerationRulesReview({
  rules,
  acknowledged,
  isDisabled,
  showAcknowledgement,
  onAcknowledgedChange,
}: BrandOsGenerationRulesReviewProps) {
  const t = useTranslations('pages.brandOsSettings.generationRulesReview');

  function valueLabel(key: string, value: unknown): string {
    if (key === 'required') return value ? t('required') : t('optional');
    if (key === 'availability' && typeof value === 'string')
      return t(`availability.${value}`);
    if (Array.isArray(value))
      return value.length ? value.join(', ') : t('empty');
    return String(value);
  }

  return (
    <section aria-label={t('title')} className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      {sections.map((section) => {
        const entries = rules[section] ?? [];
        return (
          <section
            key={section}
            aria-label={t(
              `sections.${section === 'approvedLiterals' ? 'literals' : section}`,
            )}
            className="space-y-2"
          >
            <h4 className="text-sm font-semibold">
              {t(
                `sections.${section === 'approvedLiterals' ? 'literals' : section}`,
              )}
            </h4>
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            )}
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-border p-3"
                >
                  <dl className="grid gap-2 text-sm sm:grid-cols-[minmax(8rem,1fr)_3fr]">
                    {Object.entries(entry).map(([key, value]) =>
                      value === undefined ? null : (
                        <Fragment key={key}>
                          <dt className="font-medium">{t(`fields.${key}`)}</dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {key === 'textCoverage' &&
                            value &&
                            typeof value === 'object' ? (
                              <dl className="space-y-2">
                                {Object.entries(value).map(
                                  ([coverageKey, coverageValue]) => (
                                    <div key={coverageKey}>
                                      <dt className="font-medium">
                                        {t(`fields.${coverageKey}`)}
                                      </dt>
                                      <dd className="whitespace-pre-wrap break-words">
                                        {valueLabel(coverageKey, coverageValue)}
                                      </dd>
                                    </div>
                                  ),
                                )}
                              </dl>
                            ) : (
                              valueLabel(key, value)
                            )}
                          </dd>
                        </Fragment>
                      ),
                    )}
                    {mediaSections.has(section) &&
                      !(
                        'appliesToMediaKinds' in entry &&
                        entry.appliesToMediaKinds !== undefined
                      ) && (
                        <>
                          <dt className="font-medium">
                            {t('fields.appliesToMediaKinds')}
                          </dt>
                          <dd>{t('allMedia')}</dd>
                        </>
                      )}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {showAcknowledgement && (
        <Checkbox
          aria-label={t('acknowledge')}
          label={t('acknowledge')}
          isChecked={acknowledged}
          isDisabled={isDisabled}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
        />
      )}
    </section>
  );
}
