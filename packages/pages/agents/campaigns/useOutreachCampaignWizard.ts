import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  CampaignPlatform,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { OutreachCampaignsService } from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

export interface CampaignFormData {
  label: string;
  description: string;
  platform: CampaignPlatform;
  campaignType: CampaignType;
  credential: string;
  // Discovery config
  keywords: string;
  hashtags: string;
  subreddits: string;
  excludeAuthors: string;
  minEngagement: number;
  maxEngagement: number;
  maxAgeHours: number;
  // AI config
  tone: ReplyTone;
  length: ReplyLength;
  customInstructions: string;
  context: string;
  ctaLink: string;
  useAiGeneration: boolean;
  templateText: string;
  // DM config
  dmContext: string;
  dmCustomInstructions: string;
  dmCtaLink: string;
  dmOffer: string;
  dmTemplateText: string;
  dmUseAiGeneration: boolean;
  // Rate limits
  maxPerHour: number;
  maxPerDay: number;
  delayBetweenRepliesSeconds: number;
}

export function useOutreachCampaignWizard() {
  const router = useRouter();
  const { organizationId, credentials } = useBrand();

  const notificationsService = NotificationsService.getInstance();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CampaignFormData>({
    campaignType: CampaignType.MANUAL,
    context: '',
    credential: '',
    ctaLink: '',
    customInstructions: '',
    delayBetweenRepliesSeconds: 60,
    description: '',
    dmContext: '',
    dmCtaLink: '',
    dmCustomInstructions: '',
    dmOffer: '',
    dmTemplateText: '',
    dmUseAiGeneration: true,
    excludeAuthors: '',
    hashtags: '',
    keywords: '',
    label: '',
    length: ReplyLength.MEDIUM,
    maxAgeHours: 24,
    maxEngagement: 10000,
    maxPerDay: 50,
    maxPerHour: 10,
    minEngagement: 0,
    platform: CampaignPlatform.TWITTER,
    subreddits: '',
    templateText: '',
    tone: ReplyTone.FRIENDLY,
    useAiGeneration: true,
  });

  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
  );

  const handleChange = useCallback(
    (field: keyof CampaignFormData, value: string | number | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSubmit = useCallback(async () => {
    if (!organizationId || !formData.credential) {
      notificationsService.error('Please select a credential');
      return;
    }

    setIsSubmitting(true);

    try {
      const service = await getService();

      const campaignData = {
        aiConfig: {
          context: formData.context,
          ctaLink: formData.ctaLink,
          customInstructions: formData.customInstructions,
          length: formData.length,
          templateText: formData.templateText,
          tone: formData.tone,
          useAiGeneration: formData.useAiGeneration,
        },
        campaignType: formData.campaignType,
        credential: formData.credential,
        description: formData.description,
        discoveryConfig:
          formData.campaignType === CampaignType.DISCOVERY
            ? {
                excludeAuthors: formData.excludeAuthors
                  .split(',')
                  .flatMap((s) => (s.trim() ? [s.trim()] : [])),
                hashtags: formData.hashtags
                  .split(',')
                  .flatMap((s) => (s.trim() ? [s.trim()] : [])),
                keywords: formData.keywords
                  .split(',')
                  .flatMap((s) => (s.trim() ? [s.trim()] : [])),
                maxAgeHours: formData.maxAgeHours,
                maxEngagement: formData.maxEngagement,
                minEngagement: formData.minEngagement,
                subreddits: formData.subreddits
                  .split(',')
                  .flatMap((s) => (s.trim() ? [s.trim()] : [])),
              }
            : undefined,
        label: formData.label,
        organization: organizationId,
        platform: formData.platform,
        rateLimits: {
          delayBetweenRepliesSeconds: formData.delayBetweenRepliesSeconds,
          maxPerDay: formData.maxPerDay,
          maxPerHour: formData.maxPerHour,
        },
      };

      // Add dmConfig for DM_OUTREACH campaigns
      if (formData.campaignType === CampaignType.DM_OUTREACH) {
        (campaignData as Record<string, unknown>).dmConfig = {
          context: formData.dmContext,
          ctaLink: formData.dmCtaLink,
          customInstructions: formData.dmCustomInstructions,
          offer: formData.dmOffer,
          templateText: formData.dmTemplateText,
          useAiGeneration: formData.dmUseAiGeneration,
        };
      }

      const created = await service.post(campaignData);

      notificationsService.success('Campaign created successfully');
      router.push(`/orchestration/outreach-campaigns/${created.id}`);
    } catch (error) {
      logger.error('Failed to create campaign', error);
      notificationsService.error('Failed to create campaign');
    } finally {
      setIsSubmitting(false);
    }
  }, [organizationId, formData, getService, notificationsService, router]);

  const filteredCredentials = credentials.filter(
    (c: { platform: string }) => c.platform === formData.platform,
  );

  return {
    currentStep,
    filteredCredentials,
    formData,
    handleBack,
    handleChange,
    handleNext,
    handleSubmit,
    isSubmitting,
    router,
  };
}
