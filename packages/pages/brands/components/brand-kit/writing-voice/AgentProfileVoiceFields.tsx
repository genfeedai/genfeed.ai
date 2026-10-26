'use client';

import type { AgentProfileVoiceFieldsProps } from '@props/pages/brand-detail.props';
import { EditableText } from '@ui/primitives/editable-text';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

export default function AgentProfileVoiceFields({
  isDisabled,
  onCanonicalSourceChange,
  onFieldSave,
  voiceApprovedHooks,
  voiceAudience,
  voiceBannedPhrases,
  voiceCanonicalSource,
  voiceDoNotSoundLike,
  voiceExemplarTexts,
  voiceMessagingPillars,
  voiceSampleOutput,
  voiceStyle,
  voiceTone,
  voiceValues,
  voiceWritingRules,
}: AgentProfileVoiceFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-canonical-source">
            Canonical Voice Source
          </Label>
          <Select
            disabled={isDisabled}
            value={voiceCanonicalSource}
            onValueChange={(value: 'brand' | 'founder' | 'hybrid') =>
              onCanonicalSourceChange(value)
            }
          >
            <SelectTrigger id="brand-agent-canonical-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="founder">Founder</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-tone">Tone</Label>
          <EditableText
            ariaLabel="Tone"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceTone', value)}
            value={voiceTone}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-style">Style</Label>
          <EditableText
            ariaLabel="Style"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceStyle', value)}
            value={voiceStyle}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-audience">Audience</Label>
          <EditableText
            ariaLabel="Audience"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceAudience', value)}
            placeholder="founders, marketers"
            value={voiceAudience}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-values">Values</Label>
          <EditableText
            ariaLabel="Values"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceValues', value)}
            placeholder="clarity, speed"
            value={voiceValues}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-messaging-pillars">
            Messaging Pillars
          </Label>
          <EditableText
            ariaLabel="Messaging Pillars"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceMessagingPillars', value)}
            placeholder="clarity, proof, systems thinking"
            value={voiceMessagingPillars}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-do-not-sound-like">
            Do Not Sound Like
          </Label>
          <EditableText
            ariaLabel="Do Not Sound Like"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceDoNotSoundLike', value)}
            placeholder="buzzwords, hype-heavy copy, corporate jargon"
            value={voiceDoNotSoundLike}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-approved-hooks">Approved Hooks</Label>
          <EditableText
            ariaLabel="Approved Hooks"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceApprovedHooks', value)}
            placeholder="Say the quiet part out loud, Most teams get this wrong"
            value={voiceApprovedHooks}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-banned-phrases">Banned Phrases</Label>
          <EditableText
            ariaLabel="Banned Phrases"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            onSave={(value) => onFieldSave('voiceBannedPhrases', value)}
            placeholder="game-changing AI, unlock your potential"
            value={voiceBannedPhrases}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-writing-rules">Writing Rules</Label>
          <EditableText
            ariaLabel="Writing Rules"
            displayClassName="text-sm"
            isDisabled={isDisabled}
            isMultiline
            onSave={(value) => onFieldSave('voiceWritingRules', value)}
            placeholder={'One rule per line\nLead with a claim, then the proof'}
            value={voiceWritingRules}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-agent-exemplar-texts">Exemplar Texts</Label>
          <EditableText
            ariaLabel="Exemplar Texts"
            displayClassName="text-sm leading-6"
            isDisabled={isDisabled}
            isMultiline
            onSave={(value) => onFieldSave('voiceExemplarTexts', value)}
            placeholder={
              'One real post per block, separated by a line with ---\nWe ship systems, not vibes'
            }
            value={voiceExemplarTexts}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-agent-sample-output">Sample Output</Label>
        <EditableText
          ariaLabel="Sample Output"
          className="w-full"
          displayClassName="text-sm leading-6"
          isDisabled={isDisabled}
          isMultiline
          onSave={(value) => onFieldSave('voiceSampleOutput', value)}
          placeholder="Write a representative example of how this brand should sound."
          value={voiceSampleOutput}
        />
      </div>
    </>
  );
}
