'use client';
import { ButtonSize } from '@genfeedai/contracts';
import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TurboIdeasEditorProps } from './turbo-project.types';

const FORMATS: TurboIdeaFormat[] = ['image', 'video', 'avatar'];
const MIN_IDEAS = 3;
export default function TurboIdeasEditor({
  canGenerate,
  isAvatarReady,
  name,
  settings,
  disabled,
  onChange,
  onGenerate,
  onNameChange,
}: TurboIdeasEditorProps) {
  const t = useTranslations('pages.turboProjects');
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const formats = settings.formats.map((format) => t(format)).join(' + ');
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Button
        size={ButtonSize.LG}
        icon={<Sparkles aria-hidden="true" />}
        className="w-full"
        isDisabled={disabled || !canGenerate || !settings.formats.length}
        onClick={onGenerate}
      >
        {t('generateIdeas')}
      </Button>
      <p className="text-sm text-muted-foreground">
        {t('ideasSummary', { count: settings.count, formats })}
      </p>
      <Collapsible>
        <CollapsibleTrigger showArrow className="w-auto gap-2">
          {t('options')}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-wrap gap-4">
              {FORMATS.map((format) => {
                const isUnavailable = format === 'avatar' && !isAvatarReady;
                const isChecked = settings.formats.includes(format);
                return (
                  <label key={format} className="flex items-center gap-2">
                    <Checkbox
                      checked={isChecked}
                      disabled={
                        disabled ||
                        isUnavailable ||
                        (isChecked && settings.formats.length === 1)
                      }
                      onCheckedChange={(checked) =>
                        onChange({
                          ...settings,
                          formats: checked
                            ? [...settings.formats, format]
                            : settings.formats.filter(
                                (value) => value !== format,
                              ),
                        })
                      }
                    />
                    {t(format)}
                    {isUnavailable && (
                      <span className="text-xs text-muted-foreground">
                        {t('avatarSetupNeeded')}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <Field label={t('ideaCount')}>
              <Input
                aria-label={t('ideaCount')}
                type="number"
                min={MIN_IDEAS}
                value={countDraft ?? settings.count}
                disabled={disabled}
                onChange={(event) => {
                  // Keep what is typed, so "20" is not clamped to "3" on the way.
                  setCountDraft(event.target.value);
                  const count = Number.parseInt(event.target.value, 10);
                  if (count >= MIN_IDEAS) onChange({ ...settings, count });
                }}
                onBlur={() => setCountDraft(null)}
              />
            </Field>
            <Field label={t('angle')}>
              <Input
                aria-label={t('angle')}
                value={settings.angle ?? ''}
                maxLength={300}
                placeholder={t('anglePlaceholder')}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...settings, angle: event.target.value })
                }
              />
            </Field>
            <Field label={t('name')}>
              <Input
                aria-label={t('name')}
                value={name}
                maxLength={120}
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.value.trim())
                    onNameChange(event.target.value);
                }}
              />
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
