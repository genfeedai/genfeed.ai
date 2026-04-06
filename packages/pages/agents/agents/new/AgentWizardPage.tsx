'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import type { IAgentWizardFormData } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Container from '@ui/layout/container/Container';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowLeft,
  HiArrowRight,
  HiCheck,
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

const AGENT_TYPES: {
  type: AgentType;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultBudget: number;
  platforms: string[];
}[] = [
  {
    defaultBudget: 100,
    description: 'Versatile agent for any content type',
    icon: <HiOutlineCpuChip className="size-6" />,
    label: 'General',
    platforms: ['twitter', 'instagram', 'linkedin'],
    type: AgentType.GENERAL,
  },
  {
    defaultBudget: 50,
    description: 'Optimized for Twitter/X threads and posts',
    icon: <FaXTwitter className="size-5" />,
    label: 'X Content',
    platforms: ['twitter'],
    type: AgentType.X_CONTENT,
  },
  {
    defaultBudget: 200,
    description: 'Generates images for social media content',
    icon: <HiOutlinePhoto className="size-6" />,
    label: 'Image Creator',
    platforms: ['instagram', 'twitter'],
    type: AgentType.IMAGE_CREATOR,
  },
  {
    defaultBudget: 500,
    description: 'Creates short-form video content',
    icon: <HiOutlineVideoCamera className="size-6" />,
    label: 'Video Creator',
    platforms: ['tiktok', 'youtube', 'instagram'],
    type: AgentType.VIDEO_CREATOR,
  },
  {
    defaultBudget: 300,
    description: 'AI-powered avatar for creator content',
    icon: <HiOutlineUser className="size-6" />,
    label: 'AI Avatar',
    platforms: ['tiktok', 'youtube'],
    type: AgentType.AI_AVATAR,
  },
  {
    defaultBudget: 500,
    description: 'Expert long-form articles and blog content writer',
    icon: <HiOutlineDocumentText className="size-6" />,
    label: 'Article Writer',
    platforms: ['linkedin', 'wordpress'],
    type: AgentType.ARTICLE_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'LinkedIn thought leadership and professional posts',
    icon: <FaLinkedin className="size-5" />,
    label: 'LinkedIn Copywriter',
    platforms: ['linkedin'],
    type: AgentType.LINKEDIN_CONTENT,
  },
  {
    defaultBudget: 300,
    description: 'Video ad scripts and performance marketing copy',
    icon: <HiOutlineMegaphone className="size-6" />,
    label: 'Ads Script Writer',
    platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
    type: AgentType.ADS_SCRIPT_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'TikTok/IG hooks, captions, and text overlays',
    icon: <HiOutlineBolt className="size-6" />,
    label: 'Short-Form Writer',
    platforms: ['tiktok', 'instagram'],
    type: AgentType.SHORT_FORM_WRITER,
  },
  {
    defaultBudget: 150,
    description: 'CTAs, conversion copy, and action-driving content',
    icon: <HiOutlineSparkles className="size-6" />,
    label: 'CTA / Conversion',
    platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
    type: AgentType.CTA_CONTENT,
  },
  {
    defaultBudget: 400,
    description: 'YouTube scripts, titles, descriptions, and Shorts',
    icon: <FaYoutube className="size-5" />,
    label: 'YouTube Script',
    platforms: ['youtube'],
    type: AgentType.YOUTUBE_SCRIPT,
  },
];

const PLATFORM_OPTIONS = [
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'LinkedIn', value: 'linkedin' },
];

const DEFAULT_FORM: IAgentWizardFormData = {
  agentType: AgentType.GENERAL,
  autonomyMode: AgentAutonomyMode.SUPERVISED,
  autoPublishConfidenceThreshold: 0.8,
  brand: '',
  dailyCreditBudget: 100,
  label: '',
  minCreditThreshold: 50,
  model: '',
  platforms: ['twitter'],
  qualityTier: 'balanced',
  runFrequency: AgentRunFrequency.DAILY,
  startImmediately: true,
  topics: '',
  voice: '',
};

const STEPS = [
  { id: 1, label: 'Choose Type' },
  { id: 2, label: 'Pick Brand' },
  { id: 3, label: 'Configure' },
  { id: 4, label: 'Review & Launch' },
];

function mapBrandFrequencyToRunFrequency(
  frequency?: string,
): AgentRunFrequency {
  if (!frequency) {
    return AgentRunFrequency.DAILY;
  }

  const normalized = frequency.toLowerCase();
  if (normalized.includes('6') || normalized.includes('hour')) {
    return AgentRunFrequency.EVERY_6_HOURS;
  }
  if (normalized.includes('twice') || normalized.includes('2x')) {
    return AgentRunFrequency.TWICE_DAILY;
  }

  return AgentRunFrequency.DAILY;
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <span
            className={`flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              current === step.id
                ? 'bg-foreground text-background'
                : current > step.id
                  ? 'bg-success text-success-foreground'
                  : 'bg-foreground/10 text-foreground/50'
            }`}
          >
            {current > step.id ? <HiCheck className="size-4" /> : step.id}
          </span>
          <span
            className={`text-sm ${current >= step.id ? 'text-foreground' : 'text-foreground/40'}`}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="mx-2 h-px w-6 bg-foreground/10" />
          )}
        </div>
      ))}
    </div>
  );
}

function SelectCardButton({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      onClick={onClick}
      className={`w-full rounded border p-4 text-left transition-colors ${
        isSelected
          ? 'border-foreground bg-foreground/5'
          : 'border-foreground/10 hover:border-foreground/30'
      }`}
    >
      {children}
    </Button>
  );
}

export default function AgentWizardPage() {
  const router = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IAgentWizardFormData>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const { brands } = useBrand();

  const selectedTypeConfig = AGENT_TYPES.find((t) => t.type === form.agentType);
  const selectedBrandLabel = brands.find((b) => b.id === form.brand)?.label;

  const handleBrandSelect = useCallback(
    (brandId: string) => {
      const brand = brands.find((b) => b.id === brandId);
      const config = brand?.agentConfig;
      const voiceSegments = [
        config?.voice?.tone ? `Tone: ${config.voice.tone}` : '',
        config?.voice?.style ? `Style: ${config.voice.style}` : '',
        config?.voice?.audience?.length
          ? `Audience: ${config.voice.audience.join(', ')}`
          : '',
        config?.persona ? `Persona: ${config.persona}` : '',
      ].filter(Boolean);
      const derivedVoice = voiceSegments.join(' | ');

      setForm((prev) => ({
        ...prev,
        brand: brandId,
        ...(derivedVoice && !prev.voice ? { voice: derivedVoice } : {}),
        ...(config?.defaultModel && !prev.model
          ? { model: config.defaultModel }
          : {}),
        ...(config?.strategy?.frequency
          ? {
              runFrequency: mapBrandFrequencyToRunFrequency(
                config.strategy.frequency,
              ),
            }
          : {}),
        ...(config?.strategy?.contentTypes?.length && !prev.topics
          ? { topics: config.strategy.contentTypes.join(', ') }
          : {}),
        ...(config?.strategy?.platforms?.length &&
        prev.platforms.length === 1 &&
        prev.platforms[0] === 'twitter'
          ? { platforms: config.strategy.platforms }
          : {}),
        ...(config?.autoPublish?.isEnabled || config?.autoPublish?.enabled
          ? {
              autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
              autoPublishConfidenceThreshold:
                config.autoPublish.confidenceThreshold || 0.8,
            }
          : {}),
      }));
    },
    [brands],
  );

  const handleSelectType = useCallback((type: AgentType) => {
    const config = AGENT_TYPES.find((t) => t.type === type);
    setForm((prev) => ({
      ...prev,
      agentType: type,
      dailyCreditBudget: config?.defaultBudget ?? prev.dailyCreditBudget,
      platforms: config?.platforms ?? prev.platforms,
    }));
  }, []);

  const handleTogglePlatform = useCallback((platform: string) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.label.trim()) {
      notificationsService.error('Agent label is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const service = await getService();
      await service.create({
        agentType: form.agentType as AgentType,
        autonomyMode: form.autonomyMode as AgentAutonomyMode,
        autoPublishConfidenceThreshold: form.autoPublishConfidenceThreshold,
        dailyCreditBudget: form.dailyCreditBudget,
        isActive: form.startImmediately,
        label: form.label,
        minCreditThreshold: form.minCreditThreshold,
        platforms: form.platforms,
        runFrequency: form.runFrequency,
        topics: form.topics
          ? form.topics
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      });
      notificationsService.success('Agent created successfully');
      router.push('/orchestration');
    } catch (error) {
      logger.error('Failed to create agent', { error });
      notificationsService.error('Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, getService, notificationsService, router]);

  return (
    <Container
      label="New Agent"
      description="Configure a new content agent."
      icon={HiOutlineCpuChip}
    >
      <div className="max-w-2xl">
        <StepIndicator current={step} />

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-foreground/60">
              Select the type of agent you want to create
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {AGENT_TYPES.map((config) => (
                <SelectCardButton
                  key={config.type}
                  isSelected={form.agentType === config.type}
                  onClick={() => handleSelectType(config.type)}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-foreground/70">{config.icon}</span>
                    <span className="font-medium text-sm">{config.label}</span>
                  </div>
                  <p className="text-xs text-foreground/50">
                    {config.description}
                  </p>
                  <p className="mt-2 text-xs text-foreground/40">
                    Default budget: {config.defaultBudget} credits/day
                  </p>
                </SelectCardButton>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                label={
                  <>
                    Pick Brand <HiArrowRight />
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={() => setStep(2)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-foreground/60">
              Choose a brand to auto-fill voice, strategy, and model defaults
            </p>

            {brands.length > 0 ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Brand (optional)
                </label>
                <Select
                  value={form.brand}
                  onValueChange={(value) => handleBrandSelect(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No brand selected" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-foreground/50">
                No brands found. You can continue and configure manually.
              </p>
            )}

            <div className="flex justify-between pt-2">
              <Button
                label={
                  <>
                    <HiArrowLeft /> Back
                  </>
                }
                variant={ButtonVariant.SECONDARY}
                onClick={() => setStep(1)}
              />
              <Button
                label={
                  <>
                    Configure <HiArrowRight />
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={() => setStep(3)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
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
                    onClick={() => handleTogglePlatform(opt.value)}
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
              <label className="text-sm font-medium text-foreground">
                Run Frequency
              </label>
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
              <label className="text-sm font-medium text-foreground">
                Quality Tier
              </label>
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
              <p className="text-sm font-medium text-foreground">
                Autonomy Mode
              </p>
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
                    <p className="text-xs text-foreground/50">
                      {opt.description}
                    </p>
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
                onClick={() => setStep(2)}
              />
              <Button
                label={
                  <>
                    Review <HiArrowRight />
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={() => setStep(4)}
                isDisabled={!form.label.trim()}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <p className="text-sm text-foreground/60">
              Review your agent configuration before launching
            </p>

            <div className="rounded border border-foreground/10 divide-y divide-foreground/10">
              {[
                {
                  label: 'Label',
                  value: form.label,
                },
                {
                  label: 'Brand',
                  value: selectedBrandLabel ?? '—',
                },
                {
                  label: 'Model',
                  value: form.model || '—',
                },
                {
                  label: 'Quality Tier',
                  value: form.qualityTier,
                },
                {
                  label: 'Type',
                  value: selectedTypeConfig?.label ?? form.agentType,
                },
                {
                  label: 'Platforms',
                  value: form.platforms.join(', ') || '—',
                },
                {
                  label: 'Topics',
                  value: form.topics || '—',
                },
                {
                  label: 'Run Frequency',
                  value: form.runFrequency,
                },
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
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="text-foreground/50">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
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
            </label>

            <div className="flex justify-between pt-2">
              <Button
                label={
                  <>
                    <HiArrowLeft /> Back
                  </>
                }
                variant={ButtonVariant.SECONDARY}
                onClick={() => setStep(3)}
              />
              <Button
                label={
                  <>
                    <HiCheck /> Create Agent
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={handleSubmit}
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              />
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
