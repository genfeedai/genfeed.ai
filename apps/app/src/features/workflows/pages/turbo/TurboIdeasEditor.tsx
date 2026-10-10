'use client';
import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { TurboIdeasEditorProps } from './turbo-project.types';

const FORMATS: TurboIdeaFormat[] = ['image', 'video', 'avatar'];
export default function TurboIdeasEditor({
  canGenerate,
  settings,
  disabled,
  onChange,
  onGenerate,
}: TurboIdeasEditorProps) {
  const t = useTranslations('pages.turboProjects');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        {FORMATS.map((format) => (
          <label key={format} className="flex items-center gap-2">
            <Checkbox
              checked={settings.formats.includes(format)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange({
                  ...settings,
                  formats: checked
                    ? [...settings.formats, format]
                    : settings.formats.filter((value) => value !== format),
                })
              }
            />
            {t(format)}
          </label>
        ))}
      </div>
      <Field label={t('ideaCount')}>
        <Input
          aria-label={t('ideaCount')}
          type="number"
          min={3}
          max={9}
          value={settings.count}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...settings,
              count: Math.min(9, Math.max(3, Number(event.target.value) || 3)),
            })
          }
        />
      </Field>
      <Field label={t('angle')}>
        <Input
          aria-label={t('angle')}
          value={settings.angle ?? ''}
          maxLength={300}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...settings, angle: event.target.value })
          }
        />
      </Field>
      <Button
        isDisabled={disabled || !canGenerate || !settings.formats.length}
        onClick={onGenerate}
      >
        {t('generateIdeas')}
      </Button>
    </div>
  );
}
