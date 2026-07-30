'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import Card from '@ui/card/Card';
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
import { Textarea } from '@ui/primitives/textarea';
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
    handleGenerate,
    handlePlatformOverrideChange,
    handleSave,
    isGenerating,
    isSaving,
    PLATFORM_OPTIONS,
    populatedPlatformCount,
    setForm,
  } = useBrandDetailAgentProfileCard({ brand, brandId, onRefreshBrand });

  const isBusy = isGenerating || isSaving;

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
                isDisabled={isBusy}
                icon={<Sparkles className="size-3.5" />}
              >
                Generate
              </Button>
              <Button
                size={ButtonSize.SM}
                className="h-8 px-2.5 text-xs"
                onClick={handleSave}
                isLoading={isSaving}
                isDisabled={isBusy}
              >
                Save
              </Button>
            </div>
          }
        >
          <p className="text-xs leading-5 text-muted-foreground">
            Generate scans this brand (website when available, otherwise name /
            description / guidance) and fills tone, style, audience, pillars,
            and more. Edit and save anytime.
          </p>
        </Card>

        <Card label="Persona" description="What agents optimize for.">
          <Textarea
            id="brand-agent-persona"
            aria-label="Persona"
            className="min-h-[100px]"
            placeholder="What should this brand's agents optimize for?"
            value={form.persona}
            disabled={isBusy}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                persona: event.target.value,
              }))
            }
          />
        </Card>

        <Card
          label="Content model"
          description="Optional brand override for content generation."
        >
          <Select
            value={form.defaultModel || AUTO_MODEL_SELECT_VALUE}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                defaultModel: value === AUTO_MODEL_SELECT_VALUE ? '' : value,
              }))
            }
            disabled={isBusy}
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
            onCanonicalSourceChange={(value) =>
              setForm((prev) => ({ ...prev, voiceCanonicalSource: value }))
            }
            onToneChange={(value) =>
              setForm((prev) => ({ ...prev, voiceTone: value }))
            }
            onStyleChange={(value) =>
              setForm((prev) => ({ ...prev, voiceStyle: value }))
            }
            onAudienceChange={(value) =>
              setForm((prev) => ({ ...prev, voiceAudience: value }))
            }
            onValuesChange={(value) =>
              setForm((prev) => ({ ...prev, voiceValues: value }))
            }
            onMessagingPillarsChange={(value) =>
              setForm((prev) => ({ ...prev, voiceMessagingPillars: value }))
            }
            onDoNotSoundLikeChange={(value) =>
              setForm((prev) => ({ ...prev, voiceDoNotSoundLike: value }))
            }
            onApprovedHooksChange={(value) =>
              setForm((prev) => ({ ...prev, voiceApprovedHooks: value }))
            }
            onBannedPhrasesChange={(value) =>
              setForm((prev) => ({ ...prev, voiceBannedPhrases: value }))
            }
            onWritingRulesChange={(value) =>
              setForm((prev) => ({ ...prev, voiceWritingRules: value }))
            }
            onExemplarTextsChange={(value) =>
              setForm((prev) => ({ ...prev, voiceExemplarTexts: value }))
            }
            onSampleOutputChange={(value) =>
              setForm((prev) => ({ ...prev, voiceSampleOutput: value }))
            }
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
              <Input
                id="brand-agent-content-types"
                aria-label="Content Types"
                placeholder="thread, short video, article"
                value={form.strategyContentTypes}
                disabled={isBusy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    strategyContentTypes: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-platforms"
              >
                Target Platforms
              </label>
              <Input
                id="brand-agent-platforms"
                aria-label="Target Platforms"
                placeholder="twitter, linkedin, youtube"
                value={form.strategyPlatforms}
                disabled={isBusy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    strategyPlatforms: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-frequency"
              >
                Frequency
              </label>
              <Input
                id="brand-agent-frequency"
                aria-label="Frequency"
                placeholder="daily"
                value={form.frequency}
                disabled={isBusy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    frequency: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="brand-agent-goals"
              >
                Goals
              </label>
              <Input
                id="brand-agent-goals"
                aria-label="Goals"
                placeholder="awareness, lead gen"
                value={form.strategyGoals}
                disabled={isBusy}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    strategyGoals: event.target.value,
                  }))
                }
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
                onChange={handlePlatformOverrideChange}
              />
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={handleGenerate}
            isLoading={isGenerating}
            isDisabled={isBusy}
            icon={<Sparkles className="size-3.5" />}
          >
            Generate
          </Button>
          <Button onClick={handleSave} isLoading={isSaving} isDisabled={isBusy}>
            Save
          </Button>
        </div>
      </div>
    </Container>
  );
}
