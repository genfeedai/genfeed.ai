import type { AgentStrategyBudgetFieldsProps } from '@props/automation/agent-strategy-budget-fields.props';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import { isCadenceFormValid } from './build-agent-strategy-payload';

export default function AgentStrategyCadenceFields({
  form,
  setForm,
}: AgentStrategyBudgetFieldsProps) {
  const translate = useTranslations('common.automation.cadence');
  const valid = isCadenceFormValid(form);
  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            {
              key: 'postsPerWeek',
              label: translate('weeklyTarget'),
              min: 1,
              max: 100,
            },
            {
              key: 'publishingCeilingPerWeek',
              label: translate('publishingCeiling'),
              min: 1,
              max: 1000,
            },
            {
              key: 'readyDraftReserve',
              label: translate('draftReserve'),
              min: 0,
              max: 100,
            },
          ] as const
        ).map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`strategy-${field.key}`}>{field.label}</Label>
            <Input
              id={`strategy-${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              step={1}
              value={form[field.key] ?? ''}
              aria-invalid={!valid}
              aria-describedby="strategy-cadence-help"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  [field.key]: event.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
      <p
        id="strategy-cadence-help"
        className={
          valid ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
        }
        role={valid ? undefined : 'alert'}
      >
        {translate(valid ? 'help' : 'invalid')}
      </p>
    </div>
  );
}
