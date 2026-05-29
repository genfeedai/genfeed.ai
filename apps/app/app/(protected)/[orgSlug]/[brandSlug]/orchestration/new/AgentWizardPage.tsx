'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/enums';
import type { IAgentWizardFormData } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiOutlineCpuChip } from 'react-icons/hi2';
import { StepIndicator } from './AgentWizardHelpers';
import AgentWizardStepBrand from './AgentWizardStepBrand';
import AgentWizardStepConfigure from './AgentWizardStepConfigure';
import AgentWizardStepReview from './AgentWizardStepReview';
import AgentWizardStepType from './AgentWizardStepType';

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

const AGENT_TYPE_LABELS: Partial<Record<AgentType, string>> = {
  [AgentType.GENERAL]: 'General',
  [AgentType.X_CONTENT]: 'X Content',
  [AgentType.IMAGE_CREATOR]: 'Image Creator',
  [AgentType.VIDEO_CREATOR]: 'Video Creator',
  [AgentType.AI_AVATAR]: 'AI Avatar',
  [AgentType.ARTICLE_WRITER]: 'Article Writer',
  [AgentType.LINKEDIN_CONTENT]: 'LinkedIn Copywriter',
  [AgentType.ADS_SCRIPT_WRITER]: 'Ads Script Writer',
  [AgentType.SHORT_FORM_WRITER]: 'Short-Form Writer',
  [AgentType.CTA_CONTENT]: 'CTA / Conversion',
  [AgentType.YOUTUBE_SCRIPT]: 'YouTube Script',
};

export default function AgentWizardPage() {
  const { push } = useRouter();
  const notificationsService = NotificationsService.getInstance();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IAgentWizardFormData>(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const { brands } = useBrand();

  const selectedTypeConfig = form.agentType
    ? {
        label: AGENT_TYPE_LABELS[form.agentType as AgentType] ?? form.agentType,
      }
    : undefined;
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
    const AGENT_TYPE_DEFAULTS: Partial<
      Record<AgentType, { defaultBudget: number; platforms: string[] }>
    > = {
      [AgentType.GENERAL]: {
        defaultBudget: 100,
        platforms: ['twitter', 'instagram', 'linkedin'],
      },
      [AgentType.X_CONTENT]: { defaultBudget: 50, platforms: ['twitter'] },
      [AgentType.IMAGE_CREATOR]: {
        defaultBudget: 200,
        platforms: ['instagram', 'twitter'],
      },
      [AgentType.VIDEO_CREATOR]: {
        defaultBudget: 500,
        platforms: ['tiktok', 'youtube', 'instagram'],
      },
      [AgentType.AI_AVATAR]: {
        defaultBudget: 300,
        platforms: ['tiktok', 'youtube'],
      },
      [AgentType.ARTICLE_WRITER]: {
        defaultBudget: 500,
        platforms: ['linkedin', 'wordpress'],
      },
      [AgentType.LINKEDIN_CONTENT]: {
        defaultBudget: 200,
        platforms: ['linkedin'],
      },
      [AgentType.ADS_SCRIPT_WRITER]: {
        defaultBudget: 300,
        platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
      },
      [AgentType.SHORT_FORM_WRITER]: {
        defaultBudget: 200,
        platforms: ['tiktok', 'instagram'],
      },
      [AgentType.CTA_CONTENT]: {
        defaultBudget: 150,
        platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
      },
      [AgentType.YOUTUBE_SCRIPT]: {
        defaultBudget: 400,
        platforms: ['youtube'],
      },
    };
    const config = AGENT_TYPE_DEFAULTS[type];
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
          ? form.topics.split(',').flatMap((topic) => {
              const trimmedTopic = topic.trim();
              return trimmedTopic ? [trimmedTopic] : [];
            })
          : [],
      });
      notificationsService.success('Agent created successfully');
      push('/orchestration');
    } catch (error) {
      logger.error('Failed to create agent', { error });
      notificationsService.error('Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, getService, notificationsService, push]);

  return (
    <Container
      label="New Agent"
      description="Configure a new content agent."
      icon={HiOutlineCpuChip}
    >
      <div className="max-w-2xl">
        <StepIndicator current={step} />

        {step === 1 && (
          <AgentWizardStepType
            selectedAgentType={form.agentType as AgentType}
            onSelectType={handleSelectType}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <AgentWizardStepBrand
            brands={brands}
            selectedBrandId={form.brand}
            onBrandSelect={handleBrandSelect}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <AgentWizardStepConfigure
            form={form}
            setForm={setForm}
            onTogglePlatform={handleTogglePlatform}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <AgentWizardStepReview
            form={form}
            setForm={setForm}
            selectedBrandLabel={selectedBrandLabel}
            selectedTypeConfig={selectedTypeConfig}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </Container>
  );
}
