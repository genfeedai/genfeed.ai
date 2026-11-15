'use client';

import type { BrandVideoRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import Card from '@ui/card/Card';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import type { BrandVideoIdentityEditorProps } from '@/features/brands/props/brand-video-kit.props';
import BrandVideoRuleList from './BrandVideoRuleList';
import {
  emptyVideoRules,
  ownerEvidenceIds,
  toOwnerRules,
  VIDEO_SHOT_RULE_LIMIT,
  VIDEO_THUMBNAIL_RULE_LIMIT,
} from './brand-video-kit.helpers';

const UNSET = 'unset';
const MOTION_STYLES = [
  'static',
  'subtle',
  'kinetic',
  'cinematic',
  'handheld',
] as const;
const TEMPOS = ['slow', 'medium', 'fast'] as const;
const CAPTION_STYLES = [
  'none',
  'minimal',
  'bold_word',
  'karaoke',
  'boxed',
] as const;
const CAPTION_POSITIONS = ['top', 'middle', 'bottom'] as const;
const LOGO_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
] as const;
const LOGO_APPLIES_TO = ['intro', 'outro', 'throughout'] as const;

function pick<T extends string>(
  options: readonly T[],
  value: string,
): T | undefined {
  return options.find((option) => option === value);
}

interface ChoiceProps<T extends string> {
  id: string;
  label: string;
  value: T | undefined;
  options: readonly T[];
  unsetLabel?: string;
  labelFor: (option: T) => string;
  isDisabled: boolean;
  onChange: (value: T | undefined) => void;
}

function Choice<T extends string>({
  id,
  label,
  value,
  options,
  unsetLabel,
  labelFor,
  isDisabled,
  onChange,
}: ChoiceProps<T>) {
  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value ?? UNSET}
        disabled={isDisabled}
        onValueChange={(next) => onChange(pick(options, next))}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {unsetLabel ? (
            <SelectItem value={UNSET}>{unsetLabel}</SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labelFor(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export default function BrandVideoIdentityEditor({
  video,
  isDisabled,
  onChange,
}: BrandVideoIdentityEditorProps) {
  const t = useTranslations('pages.brandVideoKit');
  const current = video ?? emptyVideoRules();
  const evidenceIds = ownerEvidenceIds();

  function replace<K extends keyof BrandVideoRulesV1>(
    key: K,
    value: BrandVideoRulesV1[K] | undefined,
  ) {
    const next = { ...current };
    if (value === undefined) Reflect.deleteProperty(next, key);
    else next[key] = value;
    onChange(next);
  }

  const logo = current.logoPlacement;
  const captions = current.captions;
  const pacing = current.pacing;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold">{t('identity.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('identity.description')}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            id="brand-video-motion"
            label={t('identity.motionStyle')}
            value={current.motionStyle?.style}
            options={MOTION_STYLES}
            unsetLabel={t('notSet')}
            labelFor={(option) => t(`options.${option}`)}
            isDisabled={isDisabled}
            onChange={(style) =>
              replace(
                'motionStyle',
                style
                  ? { ...current.motionStyle, evidenceIds, style }
                  : undefined,
              )
            }
          />
          <Choice
            id="brand-video-pacing"
            label={t('identity.pacing')}
            value={pacing?.tempo}
            options={TEMPOS}
            unsetLabel={t('notSet')}
            labelFor={(option) => t(`options.${option}`)}
            isDisabled={isDisabled}
            onChange={(tempo) =>
              replace(
                'pacing',
                tempo ? { ...pacing, evidenceIds, tempo } : undefined,
              )
            }
          />
          <Field
            label={t('identity.averageShotSeconds')}
            htmlFor="brand-video-shot-seconds"
          >
            <Input
              id="brand-video-shot-seconds"
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={pacing?.averageShotSeconds ?? ''}
              disabled={isDisabled || !pacing}
              onChange={(event) => {
                if (!pacing) return;
                const { averageShotSeconds: _previous, ...rest } = pacing;
                replace(
                  'pacing',
                  event.target.value.trim() === ''
                    ? rest
                    : {
                        ...rest,
                        averageShotSeconds: Number(event.target.value),
                      },
                );
              }}
            />
          </Field>
        </div>
        <BrandVideoRuleList
          label={t('identity.shotRules')}
          addLabel={t('identity.addShotRule')}
          rules={current.shotRules.map((rule) => rule.text)}
          maxRules={VIDEO_SHOT_RULE_LIMIT}
          isDisabled={isDisabled}
          onChange={(texts) =>
            replace('shotRules', toOwnerRules('shot', texts))
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            id="brand-video-caption-style"
            label={t('identity.captionStyle')}
            value={captions?.style}
            options={CAPTION_STYLES}
            unsetLabel={t('notSet')}
            labelFor={(option) => t(`options.${option}`)}
            isDisabled={isDisabled}
            onChange={(style) =>
              replace(
                'captions',
                style
                  ? {
                      ...captions,
                      evidenceIds,
                      position: captions?.position ?? 'bottom',
                      style,
                    }
                  : undefined,
              )
            }
          />
          <div className="flex flex-col gap-1.5">
            <Label>{t('identity.captionPosition')}</Label>
            <SegmentedControl
              ariaLabel={t('identity.captionPosition')}
              value={captions?.position ?? 'bottom'}
              isDisabled={isDisabled || !captions}
              onValueChange={(position) => {
                const next = pick(CAPTION_POSITIONS, position);
                if (captions && next)
                  replace('captions', { ...captions, position: next });
              }}
              options={CAPTION_POSITIONS.map((position) => ({
                label: t(`options.${position}`),
                value: position,
              }))}
            />
          </div>
        </div>
        <BrandVideoRuleList
          label={t('identity.thumbnailRules')}
          addLabel={t('identity.addThumbnailRule')}
          rules={current.thumbnailRules.map((rule) => rule.text)}
          maxRules={VIDEO_THUMBNAIL_RULE_LIMIT}
          isDisabled={isDisabled}
          onChange={(texts) =>
            replace('thumbnailRules', toOwnerRules('thumbnail', texts))
          }
        />
        <Switch
          aria-label={t('identity.logoEnabled')}
          label={t('identity.logoEnabled')}
          isChecked={Boolean(logo)}
          isDisabled={isDisabled}
          onCheckedChange={(isOn) =>
            replace(
              'logoPlacement',
              isOn
                ? {
                    appliesTo: 'outro',
                    evidenceIds,
                    insetRatio: 0.04,
                    position: 'top-right',
                    sizeRatio: 0.12,
                  }
                : undefined,
            )
          }
        />
        {logo ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              id="brand-video-logo-position"
              label={t('identity.logoPosition')}
              value={logo.position}
              options={LOGO_POSITIONS}
              labelFor={(option) => t(`options.${option}`)}
              isDisabled={isDisabled}
              onChange={(position) =>
                position && replace('logoPlacement', { ...logo, position })
              }
            />
            <Choice
              id="brand-video-logo-applies"
              label={t('identity.logoAppliesTo')}
              value={logo.appliesTo}
              options={LOGO_APPLIES_TO}
              labelFor={(option) => t(`options.${option}`)}
              isDisabled={isDisabled}
              onChange={(appliesTo) =>
                appliesTo && replace('logoPlacement', { ...logo, appliesTo })
              }
            />
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>
                {t('identity.logoSize', {
                  percent: Math.round(logo.sizeRatio * 100),
                })}
              </Label>
              <Slider
                aria-label={t('identity.logoSizeAria')}
                min={2}
                max={50}
                step={1}
                disabled={isDisabled}
                value={[Math.round(logo.sizeRatio * 100)]}
                onValueChange={([percent]) =>
                  replace('logoPlacement', {
                    ...logo,
                    sizeRatio: (percent ?? 12) / 100,
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
