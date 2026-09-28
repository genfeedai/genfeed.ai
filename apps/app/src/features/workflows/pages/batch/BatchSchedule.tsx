'use client';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { BatchScheduleProps } from './batch-project.types';

export default function BatchSchedule({
  canSchedule,
  targets,
  credentials,
  disabled,
  onChange,
  onSchedule,
}: BatchScheduleProps) {
  const t = useTranslations('pages.batchProjects');
  function change(
    id: string,
    patch: { isSelected?: boolean; scheduledDate?: string },
  ) {
    const credential = credentials.find((entry) => entry.id === id);
    if (!credential) return;
    const existing = targets.find((target) => target.credentialId === id);
    const target = {
      credentialId: id,
      platform: String(credential.platform).toLowerCase(),
      isSelected: false,
      ...existing,
      ...patch,
    };
    onChange([...targets.filter((entry) => entry.credentialId !== id), target]);
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('scheduleHint')}</p>
      {credentials.map((credential) => {
        const target = targets.find(
          (entry) => entry.credentialId === credential.id,
        );
        const label = credential.label || String(credential.platform);
        const date = target?.scheduledDate
          ? new Date(target.scheduledDate)
          : null;
        const local =
          date && !Number.isNaN(date.getTime())
            ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
                .toISOString()
                .slice(0, 16)
            : '';
        return (
          <div
            key={credential.id}
            className="flex flex-wrap items-center gap-3"
          >
            <label className="flex items-center gap-2">
              <Checkbox
                checked={target?.isSelected ?? false}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  change(credential.id, { isSelected: checked === true })
                }
              />
              {label}
            </label>
            <Input
              aria-label={t('scheduleFor', { name: label })}
              type="datetime-local"
              value={local}
              disabled={disabled}
              onChange={(event) =>
                change(credential.id, {
                  scheduledDate: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </div>
        );
      })}
      {!credentials.length && <p>{t('noAccounts')}</p>}
      <Button
        isDisabled={
          disabled ||
          !canSchedule ||
          !targets.some(
            (target) =>
              target.isSelected &&
              credentials.some(
                (credential) => credential.id === target.credentialId,
              ),
          )
        }
        onClick={onSchedule}
      >
        {t('scheduleApproved')}
      </Button>
    </div>
  );
}
