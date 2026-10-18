'use client';

import { ButtonVariant, Platform } from '@genfeedai/contracts';
import {
  BRAND_PUBLISH_POLICY_LIMITS,
  brandPublishPolicySchema,
  brandPublishRequiredCheckValues,
  createDefaultBrandPublishPolicy,
  isValidPolicyTimezone,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandPublishAutonomy,
  BrandPublishPolicyFormat,
  IBrandPublishPolicy,
} from '@genfeedai/contracts/interfaces';
import type {
  BrandOsPolicyEditorProps,
  BrandOsPolicyListFieldProps,
} from '@props/pages/brand-os-settings.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const POLICY_FORMATS: readonly BrandPublishPolicyFormat[] = ['text', 'image'];
const POLICY_PLATFORMS: readonly string[] = [
  Platform.TWITTER,
  Platform.LINKEDIN,
  Platform.INSTAGRAM,
  Platform.FACEBOOK,
  Platform.THREADS,
  Platform.TIKTOK,
  Platform.YOUTUBE,
  Platform.PINTEREST,
  Platform.REDDIT,
];
const DEFAULT_QUIET_HOURS = { end: '07:00', start: '22:00' };

function cleanEntries(text: string, max: number): string[] {
  return text
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.slice(0, BRAND_PUBLISH_POLICY_LIMITS.entryLength))
    .slice(0, max);
}

function readCount(value: string, min: number, max: number): number | null {
  if (!value.trim()) return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null;
}

function browserTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezone && isValidPolicyTimezone(timezone) ? timezone : 'UTC';
}

/** One entry per line; the list it emits never holds blank or duplicate lines. */
function PolicyListField({
  label,
  values,
  maxEntries,
  isDisabled,
  onChange,
}: BrandOsPolicyListFieldProps) {
  const [text, setText] = useState(() => values.join('\n'));
  // A discard or reload replaces the list; follow it unless it is this text.
  const incoming = values.join('\n');
  if (
    cleanEntries(text, maxEntries).join('\n') !==
    cleanEntries(incoming, maxEntries).join('\n')
  )
    setText(incoming);
  return (
    <Field label={label}>
      <Textarea
        disabled={isDisabled}
        maxLength={maxEntries * (BRAND_PUBLISH_POLICY_LIMITS.entryLength + 1)}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange([...new Set(cleanEntries(event.target.value, maxEntries))]);
        }}
      />
    </Field>
  );
}

/**
 * The Policy section of a Brand OS revision (#7339): what the brand's agents
 * may publish without a member. It takes effect when the revision is approved.
 */
export default function BrandOsPolicyEditor({
  policy,
  isDisabled,
  onChange,
}: BrandOsPolicyEditorProps) {
  const t = useTranslations('pages.brandOsSettings.policy');
  const [timezoneDraft, setTimezoneDraft] = useState<string | null>(null);

  if (!policy) {
    return (
      <section
        aria-label={t('title')}
        className="space-y-3 border-t border-border pt-4"
      >
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('none')}</p>
        <Button
          label={t('add')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={isDisabled}
          onClick={() =>
            onChange(createDefaultBrandPublishPolicy(browserTimezone()))
          }
        />
      </section>
    );
  }

  const current = policy;
  const validation = brandPublishPolicySchema.safeParse(current);
  const platforms = [
    ...POLICY_PLATFORMS,
    ...Object.keys(current.autonomy.platforms).filter(
      (platform) => !POLICY_PLATFORMS.includes(platform),
    ),
  ];
  const timezoneText = timezoneDraft ?? current.timezone;

  function update(patch: Partial<IBrandPublishPolicy>) {
    onChange({ ...current, ...patch });
  }

  function setPlatformAutonomy(
    platform: string,
    autonomy: BrandPublishAutonomy,
  ) {
    const next = { ...current.autonomy.platforms };
    // An unlisted platform already follows the earned streak.
    if (autonomy === 'earned') Reflect.deleteProperty(next, platform);
    else next[platform] = autonomy;
    update({ autonomy: { ...current.autonomy, platforms: next } });
  }

  function autonomySelect(
    label: string,
    value: BrandPublishAutonomy,
    onValueChange: (autonomy: BrandPublishAutonomy) => void,
  ) {
    return (
      <Select
        value={value}
        disabled={isDisabled}
        onValueChange={(next) =>
          onValueChange(next === 'review' ? 'review' : 'earned')
        }
      >
        <SelectTrigger aria-label={label} className="w-full sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="earned">{t('autonomy.earned')}</SelectItem>
          <SelectItem value="review">{t('autonomy.review')}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <section
      aria-label={t('title')}
      className="space-y-4 border-t border-border pt-4"
      data-testid="brand-os-policy"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('formatsTitle')}</h4>
        {POLICY_FORMATS.map((format) => (
          <div
            key={format}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm">{t(`formats.${format}`)}</span>
            {autonomySelect(
              t('formatLabel', { format: t(`formats.${format}`) }),
              current.autonomy.formats[format],
              (autonomy) =>
                update({
                  autonomy: {
                    ...current.autonomy,
                    formats: {
                      ...current.autonomy.formats,
                      [format]: autonomy,
                    },
                  },
                }),
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">{t('formats.video')}</span>
          <span className="text-sm text-muted-foreground">
            {t('videoAlwaysReviewed')}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('platformsTitle')}</h4>
        {platforms.map((platform) => (
          <div
            key={platform}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm capitalize">{platform}</span>
            {autonomySelect(
              t('platformLabel', { platform }),
              current.autonomy.platforms[platform] ?? 'earned',
              (autonomy) => setPlatformAutonomy(platform, autonomy),
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('maxPostsPerDay')}>
          <Input
            type="number"
            min={1}
            max={BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerDay}
            disabled={isDisabled}
            placeholder={t('noLimit')}
            value={current.maxPostsPerDay ?? ''}
            onChange={(event) =>
              update({
                maxPostsPerDay: readCount(
                  event.target.value,
                  1,
                  BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerDay,
                ),
              })
            }
          />
        </Field>
        <Field label={t('maxPostsPerWeek')}>
          <Input
            type="number"
            min={1}
            max={BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerWeek}
            disabled={isDisabled}
            placeholder={t('noLimit')}
            value={current.maxPostsPerWeek ?? ''}
            onChange={(event) =>
              update({
                maxPostsPerWeek: readCount(
                  event.target.value,
                  1,
                  BRAND_PUBLISH_POLICY_LIMITS.maxPostsPerWeek,
                ),
              })
            }
          />
        </Field>
        <Field label={t('minQualityScore')}>
          <Input
            type="number"
            min={0}
            max={100}
            disabled={isDisabled}
            placeholder={t('noMinimum')}
            value={current.minQualityScore ?? ''}
            onChange={(event) =>
              update({
                minQualityScore: readCount(event.target.value, 0, 100),
              })
            }
          />
        </Field>
        <Field label={t('timezone')}>
          <Input
            disabled={isDisabled}
            maxLength={64}
            value={timezoneText}
            onChange={(event) => {
              const value = event.target.value.trim();
              setTimezoneDraft(event.target.value);
              if (value && isValidPolicyTimezone(value)) {
                setTimezoneDraft(null);
                update({ timezone: value });
              }
            }}
          />
        </Field>
      </div>
      {timezoneDraft !== null && (
        <p className="text-sm text-destructive">{t('invalidTimezone')}</p>
      )}

      <div className="space-y-2">
        <Checkbox
          label={t('quietHours')}
          isChecked={current.quietHours !== null}
          isDisabled={isDisabled}
          onCheckedChange={(checked) =>
            update({
              quietHours: checked === true ? DEFAULT_QUIET_HOURS : null,
            })
          }
        />
        {current.quietHours && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('quietStart')}>
              <Input
                type="time"
                disabled={isDisabled}
                value={current.quietHours.start}
                onChange={(event) =>
                  current.quietHours &&
                  event.target.value &&
                  update({
                    quietHours: {
                      ...current.quietHours,
                      start: event.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label={t('quietEnd')}>
              <Input
                type="time"
                disabled={isDisabled}
                value={current.quietHours.end}
                onChange={(event) =>
                  current.quietHours &&
                  event.target.value &&
                  update({
                    quietHours: {
                      ...current.quietHours,
                      end: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
      </div>

      <PolicyListField
        label={t('bannedTopics')}
        values={current.bannedTopics}
        maxEntries={BRAND_PUBLISH_POLICY_LIMITS.bannedTopics}
        isDisabled={isDisabled}
        onChange={(bannedTopics) => update({ bannedTopics })}
      />
      <PolicyListField
        label={t('bannedClaims')}
        values={current.bannedClaims}
        maxEntries={BRAND_PUBLISH_POLICY_LIMITS.bannedClaims}
        isDisabled={isDisabled}
        onChange={(bannedClaims) => update({ bannedClaims })}
      />
      <PolicyListField
        label={t('bannedPhrases')}
        values={current.bannedPhrases}
        maxEntries={BRAND_PUBLISH_POLICY_LIMITS.bannedPhrases}
        isDisabled={isDisabled}
        onChange={(bannedPhrases) => update({ bannedPhrases })}
      />
      <p className="text-xs text-muted-foreground">{t('judgeNote')}</p>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('requiredChecksTitle')}</h4>
        {brandPublishRequiredCheckValues.map((check) => (
          <Checkbox
            key={check}
            label={t(`requiredChecks.${check}`)}
            isChecked={current.requiredChecks.includes(check)}
            isDisabled={isDisabled}
            onCheckedChange={(checked) =>
              update({
                requiredChecks:
                  checked === true
                    ? [
                        ...current.requiredChecks.filter(
                          (entry) => entry !== check,
                        ),
                        check,
                      ]
                    : current.requiredChecks.filter((entry) => entry !== check),
              })
            }
          />
        ))}
      </div>

      {!validation.success && (
        <p role="alert" className="text-sm text-destructive">
          {t('invalid', {
            error: validation.error.issues[0]?.message ?? '',
          })}
        </p>
      )}
      <Button
        label={t('remove')}
        variant={ButtonVariant.SECONDARY}
        isDisabled={isDisabled}
        onClick={() => onChange(undefined)}
      />
    </section>
  );
}
