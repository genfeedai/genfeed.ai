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
import { useMemo, useState } from 'react';
import AgentProfilePlatformOverride from './AgentProfilePlatformOverride';
import AgentProfileVoiceFields from './AgentProfileVoiceFields';
import {
  hasPlatformOverrideContent,
  PLATFORM_OPTIONS,
  useBrandDetailAgentProfileCard,
} from './useBrandDetailAgentProfileCard';

/**
 * Full-page brand writing voice + agent profile editor (`/settings/voice`).
 * Not speech/TTS — see Agent Defaults identity for default speaking voice.
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
    populatedPlatformCount,
  } = useBrandDetailAgentProfileCard({ brand, brandId, onRefreshBrand });

  const [selectedPlatform, setSelectedPlatform] = useState(
    PLATFORM_OPTIONS[0]?.value ?? 'twitter',
  );

  const selectedPlatformOption = useMemo(
    () =>
      PLATFORM_OPTIONS.find(
        (platform) => platform.value === selectedPlatform,
      ) ?? PLATFORM_OPTIONS[0],
    [selectedPlatform],
  );

  const configuredPlatforms = useMemo(
    () =>
      PLATFORM_OPTIONS.filter((platform) => {
        const override = form.platformOverrides[platform.value];
        return override ? hasPlatformOverrideContent(override) : false;
      }),
    [form.platformOverrides],
  );

  return (
    <Container>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <Card
          label="Brand voice"
          description="How agents write as this brand — tone, style, and messaging. Not the spoken TTS voice."
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
            description / guidance) and fills writing tone, style, audience, and
            pillars. Inline edits save automatically. For speech/video audio,
            set a default speaking voice under Agent Defaults.
          </p>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
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
        </div>

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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1 sm:max-w-sm">
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-platform-override-select"
                >
                  Platform
                </label>
                <Select
                  value={selectedPlatform}
                  onValueChange={setSelectedPlatform}
                  disabled={isGenerating}
                >
                  <SelectTrigger
                    id="brand-agent-platform-override-select"
                    aria-label="Platform override channel"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((platform) => {
                      const isConfigured = configuredPlatforms.some(
                        (entry) => entry.value === platform.value,
                      );
                      return (
                        <SelectItem key={platform.value} value={platform.value}>
                          {platform.label}
                          {isConfigured ? ' · configured' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {configuredPlatforms.length > 0 ? (
                <p className="text-xs text-muted-foreground sm:pb-2">
                  Configured:{' '}
                  {configuredPlatforms
                    .map((platform) => platform.label)
                    .join(', ')}
                </p>
              ) : null}
            </div>

            {selectedPlatformOption ? (
              <AgentProfilePlatformOverride
                key={selectedPlatformOption.value}
                enabledModels={enabledModels}
                label={selectedPlatformOption.label}
                override={form.platformOverrides[selectedPlatformOption.value]}
                platformValue={selectedPlatformOption.value}
                isDisabled={isGenerating}
                showHeader={false}
                onSave={handlePlatformOverrideSave}
                onSelectChange={handlePlatformOverrideSelectChange}
              />
            ) : null}
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
