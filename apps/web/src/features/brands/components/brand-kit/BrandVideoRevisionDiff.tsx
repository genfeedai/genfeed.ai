'use client';

import { useTranslations } from 'next-intl';
import type {
  BrandVideoKitValue,
  BrandVideoRevisionDiffProps,
} from '@/features/brands/props/brand-video-kit.props';
import { diffVideoKit } from './brand-video-kit.helpers';

const OPTION_VALUES = new Set([
  'static',
  'subtle',
  'kinetic',
  'cinematic',
  'handheld',
  'slow',
  'medium',
  'fast',
  'none',
  'minimal',
  'bold_word',
  'karaoke',
  'boxed',
  'top',
  'middle',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
  'intro',
  'outro',
  'throughout',
  'image',
  'differentImage',
]);

/** What the draft changes in the video identity and finishing, against the approved revision. */
export default function BrandVideoRevisionDiff({
  approved,
  draft,
}: BrandVideoRevisionDiffProps) {
  const t = useTranslations('pages.brandVideoKit');
  const changes = diffVideoKit(approved, draft);
  if (changes.length === 0) return null;

  function format(value: BrandVideoKitValue): string {
    if (value === null) return t('diff.empty');
    if (typeof value === 'boolean') return t(value ? 'diff.on' : 'diff.off');
    if (Array.isArray(value))
      return value.length ? value.join(' · ') : t('diff.empty');
    if (typeof value === 'string' && OPTION_VALUES.has(value))
      return t(`options.${value}`);
    return String(value);
  }

  return (
    <div className="flex flex-col gap-4">
      {(['video', 'finishing'] as const).map((group) => {
        const rows = changes.filter((change) => change.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">{t(`diff.${group}`)}</h4>
            <ul className="flex flex-col gap-1.5 text-sm">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span>{t(`diff.labels.${row.key}`)}</span>
                  <span className="text-muted-foreground">
                    {format(row.before)} →{' '}
                    <span className="text-foreground">{format(row.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{t('diff.help')}</p>
    </div>
  );
}
