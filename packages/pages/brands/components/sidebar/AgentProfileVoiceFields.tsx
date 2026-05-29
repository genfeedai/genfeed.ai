'use client';

import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';

type AgentProfileVoiceFieldsProps = {
  voiceCanonicalSource: 'brand' | 'founder' | 'hybrid';
  voiceTone: string;
  voiceStyle: string;
  voiceAudience: string;
  voiceValues: string;
  voiceMessagingPillars: string;
  voiceDoNotSoundLike: string;
  voiceApprovedHooks: string;
  voiceBannedPhrases: string;
  voiceWritingRules: string;
  voiceExemplarTexts: string;
  voiceSampleOutput: string;
  onCanonicalSourceChange: (value: 'brand' | 'founder' | 'hybrid') => void;
  onToneChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onAudienceChange: (value: string) => void;
  onValuesChange: (value: string) => void;
  onMessagingPillarsChange: (value: string) => void;
  onDoNotSoundLikeChange: (value: string) => void;
  onApprovedHooksChange: (value: string) => void;
  onBannedPhrasesChange: (value: string) => void;
  onWritingRulesChange: (value: string) => void;
  onExemplarTextsChange: (value: string) => void;
  onSampleOutputChange: (value: string) => void;
};

export default function AgentProfileVoiceFields({
  voiceCanonicalSource,
  voiceTone,
  voiceStyle,
  voiceAudience,
  voiceValues,
  voiceMessagingPillars,
  voiceDoNotSoundLike,
  voiceApprovedHooks,
  voiceBannedPhrases,
  voiceWritingRules,
  voiceExemplarTexts,
  voiceSampleOutput,
  onCanonicalSourceChange,
  onToneChange,
  onStyleChange,
  onAudienceChange,
  onValuesChange,
  onMessagingPillarsChange,
  onDoNotSoundLikeChange,
  onApprovedHooksChange,
  onBannedPhrasesChange,
  onWritingRulesChange,
  onExemplarTextsChange,
  onSampleOutputChange,
}: AgentProfileVoiceFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-canonical-source"
          >
            Canonical Voice Source
          </label>
          <Select
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

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-tone"
          >
            Tone
          </label>
          <Input
            id="brand-agent-tone"
            value={voiceTone}
            onChange={(event) => onToneChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-style"
          >
            Style
          </label>
          <Input
            id="brand-agent-style"
            value={voiceStyle}
            onChange={(event) => onStyleChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-audience"
          >
            Audience
          </label>
          <Input
            id="brand-agent-audience"
            placeholder="founders, marketers"
            value={voiceAudience}
            onChange={(event) => onAudienceChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-values"
          >
            Values
          </label>
          <Input
            id="brand-agent-values"
            placeholder="clarity, speed"
            value={voiceValues}
            onChange={(event) => onValuesChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-messaging-pillars"
          >
            Messaging Pillars
          </label>
          <Input
            id="brand-agent-messaging-pillars"
            placeholder="clarity, proof, systems thinking"
            value={voiceMessagingPillars}
            onChange={(event) => onMessagingPillarsChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-do-not-sound-like"
          >
            Do Not Sound Like
          </label>
          <Input
            id="brand-agent-do-not-sound-like"
            placeholder="buzzwords, hype-heavy copy, corporate jargon"
            value={voiceDoNotSoundLike}
            onChange={(event) => onDoNotSoundLikeChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-approved-hooks"
          >
            Approved Hooks
          </label>
          <Input
            id="brand-agent-approved-hooks"
            placeholder="Say the quiet part out loud, Most teams get this wrong"
            value={voiceApprovedHooks}
            onChange={(event) => onApprovedHooksChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-banned-phrases"
          >
            Banned Phrases
          </label>
          <Input
            id="brand-agent-banned-phrases"
            placeholder="game-changing AI, unlock your potential"
            value={voiceBannedPhrases}
            onChange={(event) => onBannedPhrasesChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-writing-rules"
          >
            Writing Rules
          </label>
          <Input
            id="brand-agent-writing-rules"
            placeholder="Lead with a claim, use proof, cut fluff"
            value={voiceWritingRules}
            onChange={(event) => onWritingRulesChange(event.target.value)}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="brand-agent-exemplar-texts"
          >
            Exemplar Texts
          </label>
          <Input
            id="brand-agent-exemplar-texts"
            placeholder="We ship systems, not vibes"
            value={voiceExemplarTexts}
            onChange={(event) => onExemplarTextsChange(event.target.value)}
          />
        </div>
      </div>

      <div>
        <label
          className="mb-1 block text-sm font-medium"
          htmlFor="brand-agent-sample-output"
        >
          Sample Output
        </label>
        <Textarea
          id="brand-agent-sample-output"
          className="min-h-[120px]"
          placeholder="Write a representative example of how this brand should sound."
          value={voiceSampleOutput}
          onChange={(event) => onSampleOutputChange(event.target.value)}
        />
      </div>
    </>
  );
}
