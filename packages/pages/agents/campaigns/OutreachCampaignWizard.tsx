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
import { Checkbox } from '@ui/primitives/checkbox';
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
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';
import {
  HiArrowLeft,
  HiArrowRight,
  HiCheck,
  HiRocketLaunch,
} from 'react-icons/hi2';

const STEPS = [
  { id: 1, label: 'Platform & Type' },
  { id: 2, label: 'Configuration' },
  { id: 3, label: 'AI Settings' },
  { id: 4, label: 'Rate Limits' },
  { id: 5, label: 'Review' },
];

const platformOptions = [
  {
    icon: <FaXTwitter />,
    label: 'Twitter / X',
    value: CampaignPlatform.TWITTER,
  },
  {
    icon: <FaReddit />,
    label: 'Reddit',
    value: CampaignPlatform.REDDIT,
  },
  {
    icon: <FaInstagram className="text-pink-500" />,
    label: 'Instagram',
    value: CampaignPlatform.INSTAGRAM,
  },
];

const typeOptions = [
  {
    description: 'Add specific URLs to target',
    label: 'Manual',
    value: CampaignType.MANUAL,
  },
  {
    description: 'AI discovers relevant content',
    label: 'Discovery',
    value: CampaignType.DISCOVERY,
  },
  {
    description: 'Schedule replies in advance',
    label: 'Scheduled Blast',
    value: CampaignType.SCHEDULED_BLAST,
  },
  {
    description: 'Send cold DMs to target users',
    label: 'DM Outreach',
    value: CampaignType.DM_OUTREACH,
  },
];

const toneOptions = Object.values(ReplyTone).map((tone) => ({
  label: tone.charAt(0).toUpperCase() + tone.slice(1).replace('_', ' '),
  value: tone,
}));

const lengthOptions = Object.values(ReplyLength).map((length) => ({
  label: length.charAt(0).toUpperCase() + length.slice(1),
  value: length,
}));

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
                  .map((s) => s.trim())
                  .filter(Boolean),
                hashtags: formData.hashtags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                keywords: formData.keywords
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                maxAgeHours: formData.maxAgeHours,
                maxEngagement: formData.maxEngagement,
                minEngagement: formData.minEngagement,
                subreddits: formData.subreddits
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
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
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium">Platform</label>
              <div className="grid grid-cols-2 gap-4">
                {platformOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => handleChange('platform', option.value)}
                    className={`flex items-center gap-3 border p-4 transition-colors ${
                      formData.platform === option.value
                        ? 'border-primary bg-primary/10'
                        : 'border-white/[0.08] hover:border-primary/50'
                    }`}
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <span className="font-medium">{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Campaign Type
              </label>
              <div className="space-y-3">
                {typeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => handleChange('campaignType', option.value)}
                    className={`flex w-full flex-col items-start border p-4 transition-colors ${
                      formData.campaignType === option.value
                        ? 'border-primary bg-primary/10'
                        : 'border-white/[0.08] hover:border-primary/50'
                    }`}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-sm text-foreground/60">
                      {option.description}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
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
              <label className="text-sm font-medium text-foreground">
                Credential
              </label>
              <Select
                value={formData.credential}
                onValueChange={(value) => handleChange('credential', value)}
                required
              >
                <SelectTrigger>
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
          <div className="space-y-6">
            {formData.campaignType === CampaignType.DM_OUTREACH ? (
              <>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">
                    Use AI Generation
                  </label>
                  <Checkbox
                    checked={formData.dmUseAiGeneration}
                    onCheckedChange={(checked) =>
                      handleChange('dmUseAiGeneration', checked === true)
                    }
                    aria-label="Use AI generation for outreach DMs"
                  />
                </div>

                {formData.dmUseAiGeneration ? (
                  <>
                    <Textarea
                      label="Product Context"
                      placeholder="What are you selling? Describe your product..."
                      value={formData.dmContext}
                      onChange={(e) =>
                        handleChange('dmContext', e.target.value)
                      }
                      rows={3}
                    />

                    <div className="space-y-1.5">
                      <label
                        htmlFor="campaign-wizard-dm-offer"
                        className="text-sm font-medium text-foreground"
                      >
                        Offer
                      </label>
                      <Input
                        id="campaign-wizard-dm-offer"
                        placeholder="e.g., 30-Day Content Sprint"
                        value={formData.dmOffer}
                        onChange={(e) =>
                          handleChange('dmOffer', e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="campaign-wizard-dm-cta-link"
                        className="text-sm font-medium text-foreground"
                      >
                        CTA Link
                      </label>
                      <Input
                        id="campaign-wizard-dm-cta-link"
                        placeholder="https://academy.genfeed.ai"
                        value={formData.dmCtaLink}
                        onChange={(e) =>
                          handleChange('dmCtaLink', e.target.value)
                        }
                      />
                    </div>

                    <Textarea
                      label="Custom Instructions"
                      placeholder="Keep it casual, mention the free trial..."
                      value={formData.dmCustomInstructions}
                      onChange={(e) =>
                        handleChange('dmCustomInstructions', e.target.value)
                      }
                      rows={3}
                    />
                  </>
                ) : (
                  <Textarea
                    label="DM Template"
                    placeholder="Hey {{username}}! {{offer}} — check it out: {{cta}}"
                    value={formData.dmTemplateText}
                    onChange={(e) =>
                      handleChange('dmTemplateText', e.target.value)
                    }
                    rows={4}
                  />
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">
                    Use AI Generation
                  </label>
                  <Checkbox
                    checked={formData.useAiGeneration}
                    onCheckedChange={(checked) =>
                      handleChange('useAiGeneration', checked === true)
                    }
                    aria-label="Use AI generation for replies"
                  />
                </div>

                {formData.useAiGeneration ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Reply Tone
                      </label>
                      <Select
                        value={formData.tone}
                        onValueChange={(value) =>
                          handleChange('tone', value as ReplyTone)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {toneOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Reply Length
                      </label>
                      <Select
                        value={formData.length}
                        onValueChange={(value) =>
                          handleChange('length', value as ReplyLength)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a length" />
                        </SelectTrigger>
                        <SelectContent>
                          {lengthOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Textarea
                      label="Custom Instructions"
                      placeholder="Always mention our product name..."
                      value={formData.customInstructions}
                      onChange={(e) =>
                        handleChange('customInstructions', e.target.value)
                      }
                      rows={3}
                    />

                    <Textarea
                      label="Context"
                      placeholder="We are a SaaS startup that helps..."
                      value={formData.context}
                      onChange={(e) => handleChange('context', e.target.value)}
                      rows={3}
                    />

                    <div className="space-y-1.5">
                      <label
                        htmlFor="campaign-wizard-cta-link"
                        className="text-sm font-medium text-foreground"
                      >
                        CTA Link
                      </label>
                      <Input
                        id="campaign-wizard-cta-link"
                        placeholder="https://your-product.com"
                        value={formData.ctaLink}
                        onChange={(e) =>
                          handleChange('ctaLink', e.target.value)
                        }
                      />
                    </div>
                  </>
                ) : (
                  <Textarea
                    label="Template Text"
                    placeholder="Your reply template here..."
                    value={formData.templateText}
                    onChange={(e) =>
                      handleChange('templateText', e.target.value)
                    }
                    rows={4}
                  />
                )}
              </>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <label
                htmlFor="campaign-wizard-max-per-hour"
                className="text-sm font-medium text-foreground"
              >
                Max Replies per Hour
              </label>
              <Input
                id="campaign-wizard-max-per-hour"
                type="number"
                min={1}
                max={50}
                value={formData.maxPerHour}
                onChange={(e) =>
                  handleChange('maxPerHour', parseInt(e.target.value, 10) || 10)
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="campaign-wizard-max-per-day"
                className="text-sm font-medium text-foreground"
              >
                Max Replies per Day
              </label>
              <Input
                id="campaign-wizard-max-per-day"
                type="number"
                min={1}
                max={200}
                value={formData.maxPerDay}
                onChange={(e) =>
                  handleChange('maxPerDay', parseInt(e.target.value, 10) || 50)
                }
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="campaign-wizard-delay-between-replies"
                className="text-sm font-medium text-foreground"
              >
                Delay Between Replies (seconds)
              </label>
              <Input
                id="campaign-wizard-delay-between-replies"
                type="number"
                min={30}
                value={formData.delayBetweenRepliesSeconds}
                onChange={(e) =>
                  handleChange(
                    'delayBetweenRepliesSeconds',
                    parseInt(e.target.value, 10) || 60,
                  )
                }
              />
            </div>

            {formData.campaignType === CampaignType.DM_OUTREACH && (
              <p className="text-sm text-foreground/60">
                Recommended DM limits: 5/hour, 20/day, 120s delay to avoid
                account restrictions.
              </p>
            )}
          </div>
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
