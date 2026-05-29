'use client';

import { CampaignType, ReplyLength, ReplyTone } from '@genfeedai/enums';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const toneOptions = Object.values(ReplyTone).map((tone) => ({
  label: tone.charAt(0).toUpperCase() + tone.slice(1).replace('_', ' '),
  value: tone,
}));

const lengthOptions = Object.values(ReplyLength).map((length) => ({
  label: length.charAt(0).toUpperCase() + length.slice(1),
  value: length,
}));

type Props = {
  campaignType: CampaignType;
  // reply AI config
  useAiGeneration: boolean;
  tone: ReplyTone;
  length: ReplyLength;
  customInstructions: string;
  context: string;
  ctaLink: string;
  templateText: string;
  // DM AI config
  dmUseAiGeneration: boolean;
  dmContext: string;
  dmOffer: string;
  dmCtaLink: string;
  dmCustomInstructions: string;
  dmTemplateText: string;
  onUseAiGenerationChange: (value: boolean) => void;
  onToneChange: (value: ReplyTone) => void;
  onLengthChange: (value: ReplyLength) => void;
  onCustomInstructionsChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onCtaLinkChange: (value: string) => void;
  onTemplateTextChange: (value: string) => void;
  onDmUseAiGenerationChange: (value: boolean) => void;
  onDmContextChange: (value: string) => void;
  onDmOfferChange: (value: string) => void;
  onDmCtaLinkChange: (value: string) => void;
  onDmCustomInstructionsChange: (value: string) => void;
  onDmTemplateTextChange: (value: string) => void;
};

export default function OutreachCampaignWizardStep3({
  campaignType,
  useAiGeneration,
  tone,
  length,
  customInstructions,
  context,
  ctaLink,
  templateText,
  dmUseAiGeneration,
  dmContext,
  dmOffer,
  dmCtaLink,
  dmCustomInstructions,
  dmTemplateText,
  onUseAiGenerationChange,
  onToneChange,
  onLengthChange,
  onCustomInstructionsChange,
  onContextChange,
  onCtaLinkChange,
  onTemplateTextChange,
  onDmUseAiGenerationChange,
  onDmContextChange,
  onDmOfferChange,
  onDmCtaLinkChange,
  onDmCustomInstructionsChange,
  onDmTemplateTextChange,
}: Props) {
  return (
    <div className="space-y-6">
      {campaignType === CampaignType.DM_OUTREACH ? (
        <>
          <div className="flex items-center gap-4">
            <label
              className="text-sm font-medium"
              htmlFor="campaign-wizard-dm-use-ai"
            >
              Use AI Generation
            </label>
            <Checkbox
              id="campaign-wizard-dm-use-ai"
              checked={dmUseAiGeneration}
              onCheckedChange={(checked) =>
                onDmUseAiGenerationChange(checked === true)
              }
              aria-label="Use AI generation for outreach DMs"
            />
          </div>

          {dmUseAiGeneration ? (
            <>
              <Textarea
                label="Product Context"
                placeholder="What are you selling? Describe your product..."
                value={dmContext}
                onChange={(e) => onDmContextChange(e.target.value)}
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
                  value={dmOffer}
                  onChange={(e) => onDmOfferChange(e.target.value)}
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
                  value={dmCtaLink}
                  onChange={(e) => onDmCtaLinkChange(e.target.value)}
                />
              </div>

              <Textarea
                label="Custom Instructions"
                placeholder="Keep it casual, mention the free trial..."
                value={dmCustomInstructions}
                onChange={(e) => onDmCustomInstructionsChange(e.target.value)}
                rows={3}
              />
            </>
          ) : (
            <Textarea
              label="DM Template"
              placeholder="Hey {{username}}! {{offer}} — check it out: {{cta}}"
              value={dmTemplateText}
              onChange={(e) => onDmTemplateTextChange(e.target.value)}
              rows={4}
            />
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <label
              className="text-sm font-medium"
              htmlFor="campaign-wizard-use-ai"
            >
              Use AI Generation
            </label>
            <Checkbox
              id="campaign-wizard-use-ai"
              checked={useAiGeneration}
              onCheckedChange={(checked) =>
                onUseAiGenerationChange(checked === true)
              }
              aria-label="Use AI generation for replies"
            />
          </div>

          {useAiGeneration ? (
            <>
              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="campaign-wizard-reply-tone"
                >
                  Reply Tone
                </label>
                <Select
                  value={tone}
                  onValueChange={(value) => onToneChange(value as ReplyTone)}
                >
                  <SelectTrigger id="campaign-wizard-reply-tone">
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
                <label
                  className="text-sm font-medium text-foreground"
                  htmlFor="campaign-wizard-reply-length"
                >
                  Reply Length
                </label>
                <Select
                  value={length}
                  onValueChange={(value) =>
                    onLengthChange(value as ReplyLength)
                  }
                >
                  <SelectTrigger id="campaign-wizard-reply-length">
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
                value={customInstructions}
                onChange={(e) => onCustomInstructionsChange(e.target.value)}
                rows={3}
              />

              <Textarea
                label="Context"
                placeholder="We are a SaaS startup that helps..."
                value={context}
                onChange={(e) => onContextChange(e.target.value)}
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
                  value={ctaLink}
                  onChange={(e) => onCtaLinkChange(e.target.value)}
                />
              </div>
            </>
          ) : (
            <Textarea
              label="Template Text"
              placeholder="Your reply template here..."
              value={templateText}
              onChange={(e) => onTemplateTextChange(e.target.value)}
              rows={4}
            />
          )}
        </>
      )}
    </div>
  );
}
