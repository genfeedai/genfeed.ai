'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
  Platform,
} from '@genfeedai/enums';
import type { IAgentWizardFormData, IBrand } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { preferredWorkflowTemplateIdForAgentType } from '@pages/agents/content-team/content-team-presets';
import { AgentStrategiesService } from '@services/automation/agent-strategies.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import { Cpu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { StepIndicator } from './AgentWizardHelpers';
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
  platforms: [Platform.TWITTER],
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

function buildInitialForm(
  brandId: string,
  selectedBrand: IBrand | undefined,
): IAgentWizardFormData {
  const config = selectedBrand?.agentConfig;
  const voiceSegments = [
    config?.voice?.tone ? `Tone: ${config.voice.tone}` : '',
    config?.voice?.style ? `Style: ${config.voice.style}` : '',
    config?.voice?.audience?.length
      ? `Audience: ${config.voice.audience.join(', ')}`
      : '',
    config?.persona ? `Persona: ${config.persona}` : '',
  ].filter(Boolean);

  return {
    ...DEFAULT_FORM,
    brand: brandId,
    ...(config?.autoPublish?.isEnabled || config?.autoPublish?.enabled
      ? {
          autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
          autoPublishConfidenceThreshold:
            config.autoPublish.confidenceThreshold || 0.8,
        }
      : {}),
    ...(config?.defaultModel ? { model: config.defaultModel } : {}),
    ...(config?.strategy?.contentTypes?.length
      ? { topics: config.strategy.contentTypes.join(', ') }
      : {}),
    ...(config?.strategy?.frequency
      ? {
          runFrequency: mapBrandFrequencyToRunFrequency(
            config.strategy.frequency,
          ),
        }
      : {}),
    ...(config?.strategy?.platforms?.length
      ? { platforms: config.strategy.platforms }
      : {}),
    ...(voiceSegments.length > 0 ? { voice: voiceSegments.join(' | ') } : {}),
  };
}

interface AgentWizardPageProps {
  isEmbedded?: boolean;
  onCreated?: () => Promise<void> | void;
}

export default function AgentWizardPage({
  isEmbedded = false,
  onCreated,
}: AgentWizardPageProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const collectionScope = useCollectionScope();
  const { brandId, pageScope } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const { selectedBrand } = useBrand();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IAgentWizardFormData>(() =>
    buildInitialForm(
      isBrandReady && brandId ? brandId : '',
      isBrandReady ? selectedBrand : undefined,
    ),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedBrandIdRef = useRef(isBrandReady && brandId ? brandId : '');

  useEffect(() => {
    if (
      !isBrandReady ||
      !brandId ||
      initializedBrandIdRef.current === brandId
    ) {
      return;
    }

    initializedBrandIdRef.current = brandId;
    setForm(buildInitialForm(brandId, selectedBrand));
    setStep(1);
  }, [brandId, isBrandReady, selectedBrand]);

  const getService = useAuthedService((token: string) =>
    AgentStrategiesService.getInstance(token),
  );

  const selectedTypeConfig = form.agentType
    ? {
        label: AGENT_TYPE_LABELS[form.agentType as AgentType] ?? form.agentType,
      }
    : undefined;
  const selectedBrandLabel = selectedBrand?.label;

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
    if (!isBrandReady || !brandId) {
      notificationsService.error(
        pageScope === 'org'
          ? 'Select a brand to create an agent.'
          : 'Wait for the selected brand to finish loading.',
      );
      return;
    }

    if (!form.label.trim()) {
      notificationsService.error('Agent label is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const service = await getService();
      const agentType = form.agentType as AgentType;
      await service.create({
        agentType,
        autonomyMode: form.autonomyMode as AgentAutonomyMode,
        autoPublishConfidenceThreshold: form.autoPublishConfidenceThreshold,
        brandId,
        dailyCreditBudget: form.dailyCreditBudget,
        isActive: form.startImmediately,
        label: form.label,
        minCreditThreshold: form.minCreditThreshold,
        model: form.model || undefined,
        platforms: form.platforms,
        preferredWorkflowTemplateId:
          preferredWorkflowTemplateIdForAgentType(agentType),
        qualityTier: form.qualityTier,
        runFrequency: form.runFrequency,
        topics: form.topics
          ? form.topics.split(',').flatMap((topic) => {
              const trimmedTopic = topic.trim();
              return trimmedTopic ? [trimmedTopic] : [];
            })
          : [],
        voice: form.voice || undefined,
      });
      notificationsService.success('Agent created successfully');
      if (onCreated) {
        await onCreated();
      } else {
        push(href(APP_ROUTES.AUTOMATION.AGENTS));
      }
    } catch (error) {
      logger.error('Failed to create agent', { error });
      notificationsService.error('Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    brandId,
    form,
    getService,
    href,
    isBrandReady,
    notificationsService,
    onCreated,
    pageScope,
    push,
  ]);

  const wizard = (
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
        <AgentWizardStepConfigure
          form={form}
          setForm={setForm}
          onTogglePlatform={handleTogglePlatform}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <AgentWizardStepReview
          form={form}
          setForm={setForm}
          selectedBrandLabel={selectedBrandLabel}
          selectedTypeConfig={selectedTypeConfig}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
  const content =
    !isBrandReady || !brandId ? (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {translate(pageScope === 'org' ? 'selectBrand' : 'loadingBrand')}
      </p>
    ) : (
      wizard
    );

  if (isEmbedded) {
    return content;
  }

  return (
    <Container
      label="New Agent"
      description="Configure a new content agent."
      icon={Cpu}
    >
      {content}
    </Container>
  );
}
