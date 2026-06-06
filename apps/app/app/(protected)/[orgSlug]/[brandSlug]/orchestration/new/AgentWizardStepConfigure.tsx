'use client';

import {
  AgentAutonomyMode,
  AgentRunFrequency,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import type { IAgentWizardFormData } from '@genfeedai/interfaces';
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
import { HiArrowLeft, HiArrowRight } from 'react-icons/hi2';
import { SelectCardButton } from './AgentWizardHelpers';

const PLATFORM_OPTIONS = [
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
];

type Props = {
  form: IAgentWizardFormData;
  setForm: React.Dispatch<React.SetStateAction<IAgentWizardFormData>>;
  onTogglePlatform: (platform: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function AgentWizardStepConfigure({
  form,
  setForm,
  onTogglePlatform,
  onBack,
  onNext,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="agent-wizard-label"
          className="text-sm font-medium text-foreground"
        >
          Agent Label
        </label>
        <Input
          id="agent-wizard-label"
          placeholder="e.g. Daily X Content Agent"
          value={form.label}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, label: e.target.value }))
          }
          required
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              withWrapper={false}
              size={ButtonSize.XS}
              variant={
                form.platforms.includes(opt.value)
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              onClick={() => onTogglePlatform(opt.value)}
              className="transition-colors"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="agent-topics"
          className="text-sm font-medium text-foreground"
        >
          Topics
        </label>
        <Textarea
          id="agent-topics"
          className="min-h-20"
          placeholder="marketing, AI, technology (comma-separated)"
          value={form.topics}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, topics: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Run Frequency
        </span>
        <Select
          value={form.runFrequency}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              runFrequency: value as AgentRunFrequency,
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a run frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AgentRunFrequency.DAILY}>Daily</SelectItem>
            <SelectItem value={AgentRunFrequency.TWICE_DAILY}>
              Twice Daily
            </SelectItem>
            <SelectItem value={AgentRunFrequency.EVERY_6_HOURS}>
              Every 6 Hours
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="agent-voice-persona"
          className="text-sm font-medium text-foreground"
        >
          Voice & Persona (auto-filled from brand)
        </label>
        <Textarea
          id="agent-voice-persona"
          className="min-h-20"
          placeholder="Tone, style, audience, and persona instructions..."
          value={form.voice ?? ''}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, voice: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Quality Tier
        </span>
        <Select
          value={form.qualityTier}
          onValueChange={(value) =>
            setForm((prev) => ({
              ...prev,
              qualityTier: value as IAgentWizardFormData['qualityTier'],
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a quality tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="budget">Budget</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="high_quality">High Quality</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="agent-model"
          className="text-sm font-medium text-foreground"
        >
          Model (optional)
        </label>
        <Input
          id="agent-model"
          type="text"
          placeholder="deepseek/deepseek-chat"
          value={form.model ?? ''}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, model: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="agent-daily-credit-budget"
          className="text-sm font-medium text-foreground"
        >
          Daily Credit Budget
        </label>
        <Input
          id="agent-daily-credit-budget"
          type="number"
          min={10}
          max={10000}
          value={form.dailyCreditBudget}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              dailyCreditBudget: Number(e.target.value),
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="agent-min-credit-threshold"
          className="text-sm font-medium text-foreground"
        >
          Min Credit Threshold
        </label>
        <Input
          id="agent-min-credit-threshold"
          type="number"
          min={1}
          max={10000}
          value={form.minCreditThreshold}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              minCreditThreshold: Number(e.target.value),
            }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Autonomy Mode</p>
        <div className="flex gap-3">
          {[
            {
              description: 'Review before publishing',
              label: 'Supervised',
              value: AgentAutonomyMode.SUPERVISED,
            },
            {
              description: 'Publishes automatically',
              label: 'Auto-Publish',
              value: AgentAutonomyMode.AUTO_PUBLISH,
            },
          ].map((opt) => (
            <SelectCardButton
              key={opt.value}
              isSelected={form.autonomyMode === opt.value}
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  autonomyMode: opt.value,
                  autoPublishConfidenceThreshold:
                    opt.value === AgentAutonomyMode.AUTO_PUBLISH
                      ? Math.max(prev.autoPublishConfidenceThreshold, 0.8)
                      : prev.autoPublishConfidenceThreshold,
                }))
              }
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-foreground/50">{opt.description}</p>
            </SelectCardButton>
          ))}
        </div>
      </div>

      {form.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH && (
        <div className="space-y-1.5">
          <label
            htmlFor="agent-auto-publish-threshold"
            className="text-sm font-medium text-foreground"
          >
            Auto-publish Confidence Threshold
          </label>
          <Input
            id="agent-auto-publish-threshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.autoPublishConfidenceThreshold}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                autoPublishConfidenceThreshold: Number(e.target.value),
              }))
            }
          />
        </div>
      )}

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
              Review <HiArrowRight />
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onNext}
          isDisabled={!form.label.trim()}
        />
      </div>
    </div>
  );
}
