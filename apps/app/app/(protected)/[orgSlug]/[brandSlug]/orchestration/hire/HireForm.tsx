'use client';

import { ButtonVariant } from '@genfeedai/enums';
import {
  CONTENT_TEAM_ROLE_PRESETS,
  type ContentTeamRolePreset,
} from '@pages/agents/content-team/content-team-presets';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

interface Brand {
  id: string;
  label: string;
}

interface HireFormState {
  brandId: string;
  budget: string;
  label: string;
  persona: string;
  reportsToLabel: string;
  rolePresetId: string;
  sharedTopic: string;
  teamGroup: string;
}

interface HireFormProps {
  brands: Brand[];
  form: HireFormState;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (field: keyof HireFormState, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  selectedPreset: ContentTeamRolePreset | undefined;
}

export function HireForm({
  brands,
  form,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
  selectedPreset,
}: HireFormProps) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-role"
          >
            Role Preset
          </label>
          <Select
            value={form.rolePresetId}
            onValueChange={(value) => onChange('rolePresetId', value)}
          >
            <SelectTrigger id="content-team-role">
              <SelectValue placeholder="Choose a role" />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TEAM_ROLE_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.displayRole}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="content-team-brand"
          >
            Brand
          </label>
          <Select
            value={form.brandId}
            onValueChange={(value) => onChange('brandId', value)}
          >
            <SelectTrigger id="content-team-brand">
              <SelectValue placeholder="Choose a brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          label={isSubmitting ? 'Hiring…' : 'Hire Agent'}
          type="submit"
          variant={ButtonVariant.DEFAULT}
        />
        <Button
          label="Cancel"
          onClick={onCancel}
          type="button"
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </form>
  );
}
