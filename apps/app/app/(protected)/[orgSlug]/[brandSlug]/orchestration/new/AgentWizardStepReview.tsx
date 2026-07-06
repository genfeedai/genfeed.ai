'use client';

import { AgentAutonomyMode, ButtonVariant } from '@genfeedai/enums';
import type { IAgentWizardFormData } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { HiArrowLeft, HiCheck } from 'react-icons/hi2';

type AgentTypeConfig = {
  label: string;
};

type Props = {
  form: IAgentWizardFormData;
  setForm: React.Dispatch<React.SetStateAction<IAgentWizardFormData>>;
  selectedBrandLabel: string | undefined;
  selectedTypeConfig: AgentTypeConfig | undefined;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export default function AgentWizardStepReview({
  form,
  setForm,
  selectedBrandLabel,
  selectedTypeConfig,
  onBack,
  onSubmit,
  isSubmitting,
}: Props) {
  const rows = [
    { label: 'Label', value: form.label },
    { label: 'Brand', value: selectedBrandLabel ?? '—' },
    { label: 'Model', value: form.model || '—' },
    { label: 'Quality Tier', value: form.qualityTier },
    { label: 'Type', value: selectedTypeConfig?.label ?? form.agentType },
    { label: 'Platforms', value: form.platforms.join(', ') || '—' },
    { label: 'Topics', value: form.topics || '—' },
    { label: 'Run Frequency', value: form.runFrequency },
    {
      label: 'Daily Credit Budget',
      value: `${form.dailyCreditBudget} credits`,
    },
    {
      label: 'Min Credit Threshold',
      value: `${form.minCreditThreshold} credits`,
    },
    {
      label: 'Autonomy Mode',
      value:
        form.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
          ? 'Auto-Publish'
          : 'Supervised',
    },
    ...(form.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH
      ? [
          {
            label: 'Auto-publish Threshold',
            value: String(form.autoPublishConfidenceThreshold),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground/60">
        Review your agent configuration before launching
      </p>

      <div className="rounded bg-tertiary shadow-border divide-y divide-foreground/10">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between px-4 py-3 text-sm"
          >
            <span className="text-foreground/50">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      <span className="flex items-center gap-3 cursor-pointer">
        <Checkbox
          checked={form.startImmediately}
          onCheckedChange={(checked) =>
            setForm((prev) => ({
              ...prev,
              startImmediately: checked === true,
            }))
          }
          aria-label="Start immediately after creation"
        />
        <span className="text-sm">Start immediately after creation</span>
      </span>

      <div className="flex justify-between pt-2">
        <Button
          label={
            <>
              <HiArrowLeft /> Back
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={onBack}
        />
        <Button
          label={
            <>
              <HiCheck /> Create Agent
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onSubmit}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        />
      </div>
    </div>
  );
}
