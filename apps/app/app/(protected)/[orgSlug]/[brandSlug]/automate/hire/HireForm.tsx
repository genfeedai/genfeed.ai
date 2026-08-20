'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  CONTENT_TEAM_ROLE_PRESETS,
  type ContentTeamRolePreset,
} from '@pages/agents/content-team/content-team-presets';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { SelectCardButton } from '../agents/new/AgentWizardHelpers';

interface HireFormState {
  budget: string;
  label: string;
  persona: string;
  reportsToLabel: string;
  rolePresetId: string;
  sharedTopic: string;
  teamGroup: string;
}

interface HireFormProps {
  form: HireFormState;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (field: keyof HireFormState, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  selectedPreset: ContentTeamRolePreset | undefined;
}

export function HireForm({
  form,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
  selectedPreset,
}: HireFormProps) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          Choose an agent template
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONTENT_TEAM_ROLE_PRESETS.map((preset) => (
            <SelectCardButton
              key={preset.id}
              isSelected={form.rolePresetId === preset.id}
              onClick={() => onChange('rolePresetId', preset.id)}
            >
              <span className="block text-sm font-medium text-foreground">
                {preset.displayRole}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {preset.description}
              </span>
              <span className="mt-2 block text-xs text-foreground/45">
                {preset.defaultBudget} credits / day
              </span>
            </SelectCardButton>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-agent-label"
          >
            Agent Label
          </label>
          <Input
            id="content-team-agent-label"
            onChange={(event) => onChange('label', event.target.value)}
            placeholder={selectedPreset?.defaultLabel ?? 'Agent label'}
            value={form.label}
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-budget"
          >
            Daily Budget
          </label>
          <Input
            id="content-team-budget"
            min={0}
            onChange={(event) => onChange('budget', event.target.value)}
            placeholder={String(selectedPreset?.defaultBudget ?? 0)}
            type="number"
            value={form.budget}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-reports-to"
          >
            Reports To
          </label>
          <Input
            id="content-team-reports-to"
            onChange={(event) => onChange('reportsToLabel', event.target.value)}
            placeholder="Main Orchestrator"
            value={form.reportsToLabel}
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-group"
          >
            Team Group
          </label>
          <Input
            id="content-team-group"
            onChange={(event) => onChange('teamGroup', event.target.value)}
            placeholder={selectedPreset?.teamGroup ?? 'Production'}
            value={form.teamGroup}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="content-team-persona"
        >
          Shared Persona
        </label>
        <Textarea
          id="content-team-persona"
          onChange={(event) => onChange('persona', event.target.value)}
          placeholder="Describe the creator voice, tone, and positioning for this role."
          rows={4}
          value={form.persona}
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="content-team-topic"
        >
          Primary Topic
        </label>
        <Input
          id="content-team-topic"
          onChange={(event) => onChange('sharedTopic', event.target.value)}
          placeholder="e.g. creator monetization, AI productivity, ecommerce"
          value={form.sharedTopic}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          label="Add agent"
          type="submit"
          variant={ButtonVariant.DEFAULT}
        />
        <Button
          isDisabled={isSubmitting}
          label="Cancel"
          onClick={onCancel}
          type="button"
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </form>
  );
}
