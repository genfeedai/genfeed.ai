'use client';

import type { IBrandKitRequiredTextContext } from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Progress } from '@ui/primitives/progress';
import { useTranslations } from 'next-intl';

/** Above this share of the budget the meter turns from fine to close. */
const NEAR_LIMIT_SHARE = 0.85;
const LONGEST_FIELDS_NAMED = 3;
/** An empty list or string still counts its two brackets or quotes. */
const EMPTY_FIELD_CHARACTERS = 2;

interface BrandKitTextBudgetProps {
  report: IBrandKitRequiredTextContext | null;
  /** The shown revision is the approved one, so generation already reads it. */
  isApproved: boolean;
  /** Edits are waiting to be saved; the count is from the last save. */
  isDirty: boolean;
}

function fieldLabel(field: string): string {
  return (
    BRAND_KIT_FIELD_OWNERSHIP.find((owner) => owner.key === field)?.label ??
    field
  );
}

/**
 * How much of the shared text budget the saved identity and writing voice
 * fill. Every text generation carries them whole, so a kit over the budget
 * cannot be approved, and an approved one fails every post.
 */
export default function BrandKitTextBudget({
  report,
  isApproved,
  isDirty,
}: BrandKitTextBudgetProps) {
  const t = useTranslations('pages.brandKitSettings.textBudget');
  if (!report) return null;

  const numbers = new Intl.NumberFormat('en-US');
  const isOver = report.overflowCharacters > 0;
  const isNear =
    !isOver &&
    report.requiredCharacters > report.maxCharacters * NEAR_LIMIT_SHARE;
  const tone = isOver ? 'destructive' : isNear ? 'warning' : 'success';
  const longest = report.fields
    .filter((entry) => entry.characters > EMPTY_FIELD_CHARACTERS)
    .slice(0, LONGEST_FIELDS_NAMED);
  const named = (key: 'fieldLong' | 'fieldShort', count: number) =>
    longest
      .slice(0, count)
      .map((entry) =>
        t(key, {
          characters: numbers.format(entry.characters),
          label: fieldLabel(entry.field),
        }),
      )
      .join(', ');

  return (
    <section aria-label={t('title')} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t('title')}</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t('count', {
            max: numbers.format(report.maxCharacters),
            required: numbers.format(report.requiredCharacters),
          })}
        </span>
      </div>
      <Progress
        aria-label={t('meterLabel')}
        size="sm"
        tone={tone}
        value={Math.min(
          100,
          Math.round((report.requiredCharacters / report.maxCharacters) * 100),
        )}
      />
      {isOver ? (
        <Alert variant="destructive">
          <AlertTitle>{isApproved ? t('failsPosts') : t('tooLong')}</AlertTitle>
          <AlertDescription>
            {t('overflow', {
              fields: named('fieldLong', LONGEST_FIELDS_NAMED),
              max: numbers.format(report.maxCharacters),
              over: numbers.format(report.overflowCharacters),
              required: numbers.format(report.requiredCharacters),
            })}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('fits', { fields: named('fieldShort', 2) })}
        </p>
      )}
      {isDirty ? (
        <p className="text-xs text-muted-foreground">{t('unsaved')}</p>
      ) : null}
    </section>
  );
}
