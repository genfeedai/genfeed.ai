'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Sparkles } from 'lucide-react';
import AgentProfilePlatformOverride from './AgentProfilePlatformOverride';
import AgentProfileVoiceFields from './AgentProfileVoiceFields';
import { useBrandDetailAgentProfileCard } from './useBrandDetailAgentProfileCard';

/**
 * Full-page brand voice + agent profile editor (settings/voice).
 * No modal — fields live on the page. One-click Generate fills + saves via AI.
 */
export default function BrandDetailAgentProfileCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandDetailAgentProfileCardProps) {
  const {
    AUTO_MODEL_SELECT_VALUE,
    enabledModels,
    form,
    handleCanonicalSourceChange,
    handleDefaultModelChange,
    handleFieldSave,
    handleGenerate,
    handlePlatformOverrideSave,
    handlePlatformOverrideSelectChange,
    isGenerating,
    PLATFORM_OPTIONS,
    populatedPlatformCount,
  } = useBrandDetailAgentProfileCard({ brand, brandId, onRefreshBrand });

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <Card
          label="Voice"
          description="How agents write as this brand. Generate from the brand website and kit, then tweak anything."
          headerAction={
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={handleGenerate}
                isLoading={isGenerating}
                isDisabled={isGenerating}
                icon={<Sparkles className="size-3.5" />}
              >
                Generate
              </Button>
            </div>
          }
        >
          <p className="text-xs leading-5 text-muted-foreground">
            Generate scans this brand (website when available, otherwise name /
            description / guidance) and fills tone, style, audience, pillars,
            and more. Inline edits save automatically.
          </p>
        </Card>

        <Card label="Persona" description="What agents optimize for.">
          <EditableText
            ariaLabel="Persona"
            className="w-full"
            displayClassName="text-sm leading-6"
            isDisabled={isGenerating}
            isMultiline
            onSave={(value) => handleFieldSave('persona', value)}
            placeholder="What should this brand's agents optimize for?"
            value={form.persona}
          />
        </Card>

        <Card
          label="Content model"
          description="Optional brand override for content generation."
        >
          <Select
            value={form.defaultModel || AUTO_MODEL_SELECT_VALUE}
            onValueChange={(value) =>
              handleDefaultModelChange(
                value === AUTO_MODEL_SELECT_VALUE ? '' : value,
              )
            }
            disabled={isGenerating}
          >
            <SelectTrigger
              id="brand-agent-default-model"
              aria-label="Brand Content Generation Model Override"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_MODEL_SELECT_VALUE}>Auto</SelectItem>
              {enabledModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Auto inherits the organization content model. Override only when
            this brand needs a different baseline.
          </p>
        </Card>

        <Card label="Voice fields" description="Canonical writing system.">
          <AgentProfileVoiceFields
            voiceCanonicalSource={form.voiceCanonicalSource}
            voiceTone={form.voiceTone}
            voiceStyle={form.voiceStyle}
            voiceAudience={form.voiceAudience}
            voiceValues={form.voiceValues}
            voiceMessagingPillars={form.voiceMessagingPillars}
            voiceDoNotSoundLike={form.voiceDoNotSoundLike}
            voiceApprovedHooks={form.voiceApprovedHooks}
            voiceBannedPhrases={form.voiceBannedPhrases}
            voiceWritingRules={form.voiceWritingRules}
            voiceExemplarTexts={form.voiceExemplarTexts}
            voiceSampleOutput={form.voiceSampleOutput}
            isDisabled={isGenerating}
            onCanonicalSourceChange={handleCanonicalSourceChange}
            onFieldSave={handleFieldSave}
          />
        </Card>

        <Card
          label="Strategy"
          description="What to publish, where, and how often."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-content-types"
              >
                Content Types
              </label>
              <EditableText
                ariaLabel="Content Types"
                displayClassName="text-sm"
                isDisabled={isGenerating}
                onSave={(value) =>
                  handleFieldSave('strategyContentTypes', value)
                }
                placeholder="thread, short video, article"
                value={form.strategyContentTypes}
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-platforms"
              >
                Target Platforms
              </label>
              <EditableText
                ariaLabel="Target Platforms"
                displayClassName="text-sm"
                isDisabled={isGenerating}
                onSave={(value) => handleFieldSave('strategyPlatforms', value)}
                placeholder="twitter, linkedin, youtube"
                value={form.strategyPlatforms}
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-frequency"
              >
                Frequency
              </label>
              <EditableText
                ariaLabel="Frequency"
                displayClassName="text-sm"
                isDisabled={isGenerating}
                onSave={(value) => handleFieldSave('frequency', value)}
                placeholder="daily"
                value={form.frequency}
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-goals"
              >
                Goals
              </label>
              <EditableText
                ariaLabel="Goals"
                displayClassName="text-sm"
                isDisabled={isGenerating}
                onSave={(value) => handleFieldSave('strategyGoals', value)}
                placeholder="awareness, lead gen"
                value={form.strategyGoals}
              />
            </div>
          </div>
        </Card>

        <Card
          label="Platform overrides"
          description={
            populatedPlatformCount > 0
              ? `${populatedPlatformCount} platform override${populatedPlatformCount === 1 ? '' : 's'} configured. Optional per-channel tweaks.`
              : 'Optional. Tune persona, tone, and routing per channel when needed.'
          }
        >
          <div className="space-y-4">
            {PLATFORM_OPTIONS.map((platform) => (
              <AgentProfilePlatformOverride
                key={platform.value}
                enabledModels={enabledModels}
                label={platform.label}
                override={form.platformOverrides[platform.value]}
                platformValue={platform.value}
                isDisabled={isGenerating}
                onSave={handlePlatformOverrideSave}
                onSelectChange={handlePlatformOverrideSelectChange}
              />
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={handleGenerate}
            isLoading={isGenerating}
            isDisabled={isGenerating}
            icon={<Sparkles className="size-3.5" />}
          >
            Generate
          </Button>
        </div>
      </div>
    </Container>
  );
}
