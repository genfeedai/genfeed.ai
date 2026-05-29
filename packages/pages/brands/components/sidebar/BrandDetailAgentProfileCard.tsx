'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import AgentProfilePlatformOverride from './AgentProfilePlatformOverride';
import AgentProfileSummaryCard from './AgentProfileSummaryCard';
import AgentProfileVoiceFields from './AgentProfileVoiceFields';
import { useBrandDetailAgentProfileCard } from './useBrandDetailAgentProfileCard';

export default function BrandDetailAgentProfileCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandDetailAgentProfileCardProps) {
  const {
    AUTO_MODEL_SELECT_VALUE,
    enabledModels,
    form,
    handlePlatformOverrideChange,
    handleSave,
    isDialogOpen,
    isSaving,
    PLATFORM_OPTIONS,
    populatedPlatformCount,
    setForm,
    setIsDialogOpen,
    summaryItems,
  } = useBrandDetailAgentProfileCard({ brand, brandId, onRefreshBrand });

  return (
    <>
      <AgentProfileSummaryCard
        onManage={() => setIsDialogOpen(true)}
        summaryItems={summaryItems}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agent Profile</DialogTitle>
            <DialogDescription>
              Configure the brand-level persona, voice, strategy, and optional
              per-platform overrides used by autonomous agents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-persona"
                >
                  Persona
                </label>
                <Textarea
                  id="brand-agent-persona"
                  className="min-h-[120px]"
                  placeholder="What should this brand's agents optimize for?"
                  value={form.persona}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      persona: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="brand-agent-default-model"
                >
                  Brand Content Generation Model Override
                </label>
                <Select
                  value={form.defaultModel || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultModel:
                        value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="brand-agent-default-model"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      Auto
                    </SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Auto inherits the organization content generation model. Use a
                  brand override only when this brand should write with a
                  different baseline model.
                </p>
              </div>
            </div>

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
                  placeholder="thread, short video, article"
                  value={form.strategyContentTypes}
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
                  placeholder="twitter, linkedin, youtube"
                  value={form.strategyPlatforms}
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
                  placeholder="daily"
                  value={form.frequency}
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
                  placeholder="awareness, lead gen"
                  value={form.strategyGoals}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      strategyGoals: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Platform Overrides</h3>
                <p className="text-xs text-muted-foreground">
                  {populatedPlatformCount} platform overrides configured. Use
                  these to tune persona, tone, and routing per channel.
                </p>
              </div>

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
            </div>
          </div>

          <DialogFooter>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => setIsDialogOpen(false)}
              isDisabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              label="Save Agent Profile"
              onClick={handleSave}
              isLoading={isSaving}
              isDisabled={isSaving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
