'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';

import OutreachCampaignWizardStep1 from './OutreachCampaignWizardStep1';
import OutreachCampaignWizardStep2 from './OutreachCampaignWizardStep2';
import OutreachCampaignWizardStep3 from './OutreachCampaignWizardStep3';
import OutreachCampaignWizardStep4 from './OutreachCampaignWizardStep4';
import OutreachCampaignWizardStep5 from './OutreachCampaignWizardStep5';
import { useOutreachCampaignWizard } from './useOutreachCampaignWizard';

const STEPS = [
  { id: 1, label: 'Platform & Type' },
  { id: 2, label: 'Configuration' },
  { id: 3, label: 'AI Settings' },
  { id: 4, label: 'Rate Limits' },
  { id: 5, label: 'Review' },
];

export default function OutreachCampaignWizard() {
  const translate = useTranslations('pages.outreachCampaign');
  const {
    currentStep,
    filteredCredentials,
    formData,
    handleBack,
    handleChange,
    handleNext,
    handleSubmit,
    isPairExecutable,
    isScheduleComplete,
    isSubmitting,
    router,
  } = useOutreachCampaignWizard();

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
          <OutreachCampaignWizardStep2
            campaignType={formData.campaignType}
            credential={formData.credential}
            description={formData.description}
            filteredCredentials={filteredCredentials.map((credential) => ({
              externalHandle: credential.externalHandle ?? '',
              id: credential.id,
              platform: credential.platform,
            }))}
            hashtags={formData.hashtags}
            keywords={formData.keywords}
            label={formData.label}
            platform={formData.platform}
            subreddits={formData.subreddits}
            onCredentialChange={(value) => handleChange('credential', value)}
            onDescriptionChange={(value) => handleChange('description', value)}
            onHashtagsChange={(value) => handleChange('hashtags', value)}
            onKeywordsChange={(value) => handleChange('keywords', value)}
            onLabelChange={(value) => handleChange('label', value)}
            onScheduledLocalDateTimeChange={(value) =>
              handleChange('scheduledLocalDateTime', value)
            }
            onSubredditsChange={(value) => handleChange('subreddits', value)}
            onTimezoneChange={(value) => handleChange('timezone', value)}
            scheduledLocalDateTime={formData.scheduledLocalDateTime}
            timezone={formData.timezone}
          />
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
          <OutreachCampaignWizardStep5
            campaignType={formData.campaignType}
            description={formData.description}
            label={formData.label}
            maxPerDay={formData.maxPerDay}
            maxPerHour={formData.maxPerHour}
            platform={formData.platform}
            scheduledLocalDateTime={formData.scheduledLocalDateTime}
            timezone={formData.timezone}
            tone={formData.tone}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Container
      label={translate('createTitle')}
      description={translate('createDescription')}
      icon={Rocket}
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
                {step.id < currentStep ? <Check /> : step.id}
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
                <ArrowLeft /> Back
              </>
            }
            variant={ButtonVariant.SECONDARY}
            onClick={
              currentStep === 1
                ? () => router.push(APP_ROUTES.MESSAGES.OUTREACH)
                : handleBack
            }
          />

          {currentStep < STEPS.length ? (
            <Button
              label={
                <>
                  Next <ArrowRight />
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleNext}
              isDisabled={
                !isPairExecutable ||
                (currentStep === 2 && (!formData.label || !isScheduleComplete))
              }
            />
          ) : (
            <Button
              label={
                <>
                  <Rocket /> {translate('createAction')}
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleSubmit}
              isDisabled={
                isSubmitting ||
                !isPairExecutable ||
                !isScheduleComplete ||
                !formData.label ||
                !formData.credential
              }
            />
          )}
        </div>
      </div>
    </Container>
  );
}
