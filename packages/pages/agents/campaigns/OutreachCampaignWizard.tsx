'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  CampaignPlatform,
  CampaignType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { OutreachCampaignsService } from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Textarea from '@ui/inputs/textarea/Textarea';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  HiArrowLeft,
  HiArrowRight,
  HiCheck,
  HiRocketLaunch,
} from 'react-icons/hi2';
import OutreachCampaignWizardStep1 from './OutreachCampaignWizardStep1';
import OutreachCampaignWizardStep3 from './OutreachCampaignWizardStep3';
import OutreachCampaignWizardStep4 from './OutreachCampaignWizardStep4';

const STEPS = [
  { id: 1, label: 'Platform & Type' },
  { id: 2, label: 'Configuration' },
  { id: 3, label: 'AI Settings' },
  { id: 4, label: 'Rate Limits' },
  { id: 5, label: 'Review' },
];

interface CampaignFormData {
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

export default function OutreachCampaignWizard() {
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
    if (currentStep < STEPS.length) {
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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <OutreachCampaignWizardStep1
            platform={formData.platform}
            campaignType={formData.campaignType}
            onPlatformChange={(value) => handleChange('platform', value)}
            onTypeChange={(value) => handleChange('campaignType', value)}
          />
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <label
                htmlFor="campaign-wizard-name"
                className="text-sm font-medium text-foreground"
              >
                Campaign Name
              </label>
              <Input
                id="campaign-wizard-name"
                placeholder="e.g., Product Launch Q1"
                value={formData.label}
                onChange={(e) => handleChange('label', e.target.value)}
                required
              />
            </div>

            <Textarea
              label="Description"
              placeholder="Brief description of the campaign goals"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
            />

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-foreground"
                htmlFor="campaign-wizard-credential"
              >
                Credential
              </label>
              <Select
                value={formData.credential}
                onValueChange={(value) => handleChange('credential', value)}
                required
              >
                <SelectTrigger id="campaign-wizard-credential">
                  <SelectValue placeholder="Select a credential" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCredentials.map((cred) => (
                    <SelectItem key={cred.id} value={cred.id}>
                      @{cred.externalHandle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.campaignType === CampaignType.DISCOVERY && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="campaign-wizard-keywords"
                    className="text-sm font-medium text-foreground"
                  >
                    Keywords (comma-separated)
                  </label>
                  <Input
                    id="campaign-wizard-keywords"
                    placeholder="startup, saas, tech"
                    value={formData.keywords}
                    onChange={(e) => handleChange('keywords', e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="campaign-wizard-hashtags"
                    className="text-sm font-medium text-foreground"
                  >
                    Hashtags (comma-separated)
                  </label>
                  <Input
                    id="campaign-wizard-hashtags"
                    placeholder="buildinpublic, startup"
                    value={formData.hashtags}
                    onChange={(e) => handleChange('hashtags', e.target.value)}
                  />
                </div>

                {formData.platform === CampaignPlatform.REDDIT && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="campaign-wizard-subreddits"
                      className="text-sm font-medium text-foreground"
                    >
                      Subreddits (comma-separated)
                    </label>
                    <Input
                      id="campaign-wizard-subreddits"
                      placeholder="entrepreneur, startups"
                      value={formData.subreddits}
                      onChange={(e) =>
                        handleChange('subreddits', e.target.value)
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 3:
        return (
          <OutreachCampaignWizardStep3
            campaignType={formData.campaignType}
            useAiGeneration={formData.useAiGeneration}
            tone={formData.tone}
            length={formData.length}
            customInstructions={formData.customInstructions}
            context={formData.context}
            ctaLink={formData.ctaLink}
            templateText={formData.templateText}
            dmUseAiGeneration={formData.dmUseAiGeneration}
            dmContext={formData.dmContext}
            dmOffer={formData.dmOffer}
            dmCtaLink={formData.dmCtaLink}
            dmCustomInstructions={formData.dmCustomInstructions}
            dmTemplateText={formData.dmTemplateText}
            onUseAiGenerationChange={(value) =>
              handleChange('useAiGeneration', value)
            }
            onToneChange={(value) => handleChange('tone', value)}
            onLengthChange={(value) => handleChange('length', value)}
            onCustomInstructionsChange={(value) =>
              handleChange('customInstructions', value)
            }
            onContextChange={(value) => handleChange('context', value)}
            onCtaLinkChange={(value) => handleChange('ctaLink', value)}
            onTemplateTextChange={(value) =>
              handleChange('templateText', value)
            }
            onDmUseAiGenerationChange={(value) =>
              handleChange('dmUseAiGeneration', value)
            }
            onDmContextChange={(value) => handleChange('dmContext', value)}
            onDmOfferChange={(value) => handleChange('dmOffer', value)}
            onDmCtaLinkChange={(value) => handleChange('dmCtaLink', value)}
            onDmCustomInstructionsChange={(value) =>
              handleChange('dmCustomInstructions', value)
            }
            onDmTemplateTextChange={(value) =>
              handleChange('dmTemplateText', value)
            }
          />
        );

      case 4:
        return (
          <OutreachCampaignWizardStep4
            campaignType={formData.campaignType}
            maxPerHour={formData.maxPerHour}
            maxPerDay={formData.maxPerDay}
            delayBetweenRepliesSeconds={formData.delayBetweenRepliesSeconds}
            onMaxPerHourChange={(value) => handleChange('maxPerHour', value)}
            onMaxPerDayChange={(value) => handleChange('maxPerDay', value)}
            onDelayBetweenRepliesSecondsChange={(value) =>
              handleChange('delayBetweenRepliesSeconds', value)
            }
          />
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className=" border border-white/[0.08] p-4">
              <h3 className="mb-4 font-semibold">Review Your Campaign</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-foreground/60">Name:</span>
                  <span className="ml-2 font-medium">{formData.label}</span>
                </div>
                <div>
                  <span className="text-foreground/60">Platform:</span>
                  <Badge variant="secondary" className="ml-2">
                    {formData.platform}
                  </Badge>
                </div>
                <div>
                  <span className="text-foreground/60">Type:</span>
                  <Badge variant="secondary" className="ml-2">
                    {formData.campaignType}
                  </Badge>
                </div>
                <div>
                  <span className="text-foreground/60">Tone:</span>
                  <span className="ml-2">{formData.tone}</span>
                </div>
                <div>
                  <span className="text-foreground/60">Max/Hour:</span>
                  <span className="ml-2">{formData.maxPerHour}</span>
                </div>
                <div>
                  <span className="text-foreground/60">Max/Day:</span>
                  <span className="ml-2">{formData.maxPerDay}</span>
                </div>
              </div>

              {formData.description && (
                <div className="mt-4">
                  <span className="text-foreground/60">Description:</span>
                  <p className="mt-1 text-sm">{formData.description}</p>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Container
      label="Create Campaign"
      description="Set up a new marketing campaign"
      icon={HiRocketLaunch}
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex flex-1 items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  step.id <= currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-foreground/10 text-foreground/60'
                }`}
              >
                {step.id < currentStep ? <HiCheck /> : step.id}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 transition-colors ${
                    step.id < currentStep ? 'bg-primary' : 'bg-foreground/10'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-center">
          <h2 className="text-xl font-semibold">
            {STEPS[currentStep - 1].label}
          </h2>
        </div>

        <div className="min-h-form">{renderStep()}</div>

        <div className="flex justify-between">
          <Button
            label={
              <>
                <HiArrowLeft /> Back
              </>
            }
            variant={ButtonVariant.SECONDARY}
            onClick={
              currentStep === 1
                ? () => router.push('/orchestration/outreach-campaigns')
                : handleBack
            }
          />

          {currentStep < STEPS.length ? (
            <Button
              label={
                <>
                  Next <HiArrowRight />
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleNext}
              isDisabled={currentStep === 2 && !formData.label}
            />
          ) : (
            <Button
              label={
                <>
                  <HiRocketLaunch /> Create Campaign
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleSubmit}
              isDisabled={
                isSubmitting || !formData.label || !formData.credential
              }
            />
          )}
        </div>
      </div>
    </Container>
  );
}
