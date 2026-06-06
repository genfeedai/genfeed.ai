'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiArrowRight, HiGlobeAlt } from 'react-icons/hi2';

type Props = {
  brandName: string;
  websiteUrl: string;
  submitting: boolean;
  onBrandNameChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
};

export default function BrandFormFields({
  brandName,
  websiteUrl,
  submitting,
  onBrandNameChange,
  onWebsiteUrlChange,
  onContinue,
  onSkip,
}: Props) {
  return (
    <div className="step-form opacity-0 max-w-md space-y-6">
      {/* Name */}
      <div>
        <label
          htmlFor="brand-name"
          className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2"
        >
          Name
          <span className="text-white/25 font-normal normal-case tracking-normal ml-1">
            (required)
          </span>
        </label>
        <Input
          id="brand-name"
          type="text"
          value={brandName}
          onChange={(e) => onBrandNameChange(e.target.value)}
          placeholder="Your name or brand"
          required
          className="h-12 rounded-none border-white/[0.08] bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/20 focus-visible:border-white/30 focus-visible:ring-0"
        />
      </div>

      {/* Website URL */}
      <div>
        <label
          htmlFor="brand-website-url"
          className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2"
        >
          Website URL
          <span className="text-white/20 font-normal normal-case tracking-normal ml-1">
            (optional)
          </span>
        </label>
        <div className="relative">
          <HiGlobeAlt className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <Input
            id="brand-website-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => onWebsiteUrlChange(e.target.value)}
            placeholder="https://yoursite.com"
            className="h-12 rounded-none border-white/[0.08] bg-white/[0.04] px-4 pl-12 text-sm text-white placeholder:text-white/20 focus-visible:border-white/30 focus-visible:ring-0"
          />
        </div>
        <p className="text-xs text-white/20 mt-1.5">
          We&apos;ll extract your brand colors, logo, and voice
        </p>
      </div>

      {/* Continue button */}
      <div className="step-actions opacity-0">
        <div className="flex items-center gap-3">
          <Button
            variant={ButtonVariant.WHITE}
            size={ButtonSize.DEFAULT}
            label="Continue"
            icon={<HiArrowRight className="size-4" />}
            isLoading={submitting}
            isDisabled={!brandName.trim()}
            onClick={onContinue}
            className="rounded-none px-5"
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.DEFAULT}
            label="Skip Onboarding"
            isLoading={submitting}
            onClick={onSkip}
            className="rounded-none px-5"
          />
        </div>
      </div>
    </div>
  );
}
