'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { ArrowRight, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Props = {
  brandName: string;
  organizationName: string;
  targetAudience: string;
  tone: string;
  websiteUrl: string;
  errorMessage: string | null;
  submitting: boolean;
  onBrandNameChange: (value: string) => void;
  onOrganizationNameChange: (value: string) => void;
  onTargetAudienceChange: (value: string) => void;
  onToneChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
};

type ChipOption = {
  label: string;
  value: string;
};

function ChipGroup({
  label,
  onChange,
  optionalLabel,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  optionalLabel: string;
  options: readonly ChipOption[];
  value: string;
}) {
  return (
    <div>
      <p className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {label}
        <span className="text-gray-800 font-normal normal-case tracking-normal ml-1">
          {optionalLabel}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = value === option.value;

          return (
            <Button
              key={option.value}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              label={option.label}
              aria-pressed={isSelected}
              withWrapper={false}
              onClick={() => onChange(isSelected ? '' : option.value)}
              className={`h-9 border px-3 text-xs font-medium transition ${
                isSelected
                  ? 'border-border-strong bg-hover text-foreground'
                  : 'border-border bg-background-tertiary text-muted-foreground hover:border-border-strong hover:text-foreground'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function BrandFormFields({
  brandName,
  organizationName,
  targetAudience,
  tone,
  websiteUrl,
  errorMessage,
  submitting,
  onBrandNameChange,
  onOrganizationNameChange,
  onTargetAudienceChange,
  onToneChange,
  onWebsiteUrlChange,
  onContinue,
  onSkip,
}: Props) {
  const translate = useTranslations('pages.onboarding.brand');
  const audienceOptions: readonly ChipOption[] = [
    {
      label: translate('audience.options.founders'),
      value: 'Founders',
    },
    {
      label: translate('audience.options.marketingTeams'),
      value: 'Marketing teams',
    },
    {
      label: translate('audience.options.creators'),
      value: 'Creators',
    },
    {
      label: translate('audience.options.developers'),
      value: 'Developers',
    },
  ];
  const toneOptions: readonly ChipOption[] = [
    {
      label: translate('tone.options.professional'),
      value: 'Professional',
    },
    { label: translate('tone.options.playful'), value: 'Playful' },
    { label: translate('tone.options.bold'), value: 'Bold' },
    { label: translate('tone.options.minimal'), value: 'Minimal' },
  ];

  return (
    <div className="step-form max-w-md space-y-6">
      {/* Name */}
      <div>
        <label
          htmlFor="brand-name"
          className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          {translate('fields.name.label')}
          <span className="text-gray-800 font-normal normal-case tracking-normal ml-1">
            {translate('fields.required')}
          </span>
        </label>
        <Input
          id="brand-name"
          type="text"
          value={brandName}
          onChange={(e) => onBrandNameChange(e.target.value)}
          placeholder={translate('fields.name.placeholder')}
          required
          className="h-12 rounded-none border-border bg-background-tertiary px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-border-strong focus-visible:ring-0"
        />
      </div>

      {/* Organization Name */}
      <div>
        <label
          htmlFor="organization-name"
          className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          {translate('fields.organization.label')}
          <span className="text-gray-800 font-normal normal-case tracking-normal ml-1">
            {translate('fields.required')}
          </span>
        </label>
        <Input
          id="organization-name"
          type="text"
          value={organizationName}
          onChange={(e) => onOrganizationNameChange(e.target.value)}
          placeholder={translate('fields.organization.placeholder')}
          required
          className="h-12 rounded-none border-border bg-background-tertiary px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-border-strong focus-visible:ring-0"
        />
      </div>

      {/* Website URL */}
      <div>
        <label
          htmlFor="brand-website-url"
          className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
        >
          {translate('fields.website.label')}
          <span className="text-gray-800 font-normal normal-case tracking-normal ml-1">
            {translate('fields.optional')}
          </span>
        </label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-800" />
          <Input
            id="brand-website-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => onWebsiteUrlChange(e.target.value)}
            placeholder={translate('fields.website.placeholder')}
            className="h-12 rounded-none border-border bg-background-tertiary px-4 pl-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-border-strong focus-visible:ring-0"
          />
        </div>
        <p className="text-xs text-gray-800 mt-1.5">
          {translate('fields.website.help')}
        </p>
      </div>

      <ChipGroup
        label={translate('audience.label')}
        optionalLabel={translate('fields.optional')}
        options={audienceOptions}
        value={targetAudience}
        onChange={onTargetAudienceChange}
      />

      <ChipGroup
        label={translate('tone.label')}
        optionalLabel={translate('fields.optional')}
        options={toneOptions}
        value={tone}
        onChange={onToneChange}
      />

      {errorMessage ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            <div className="font-medium">{translate('errors.title')}</div>
            <div className="text-xs text-foreground/70">{errorMessage}</div>
          </div>
        </Alert>
      ) : null}

      {/* Continue button */}
      <div className="step-actions">
        <div className="flex items-center gap-3">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.DEFAULT}
            label={translate('actions.continue')}
            icon={<ArrowRight className="size-4" />}
            isLoading={submitting}
            isDisabled={!brandName.trim() || !organizationName.trim()}
            onClick={onContinue}
            className="rounded-none px-5"
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.DEFAULT}
            label={translate('actions.skip')}
            isLoading={submitting}
            onClick={onSkip}
            className="rounded-none px-5"
          />
        </div>
      </div>
    </div>
  );
}
