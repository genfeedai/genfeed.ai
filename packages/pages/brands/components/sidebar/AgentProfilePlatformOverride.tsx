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

const AUTO_MODEL_SELECT_VALUE = '__auto__';

type PlatformOverrideFormState = {
  approvedHooks: string;
  contentTypes: string;
  defaultModel: string;
  bannedPhrases: string;
  canonicalSource: 'brand' | 'founder' | 'hybrid' | '';
  doNotSoundLike: string;
  exemplarTexts: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  audience: string;
  values: string;
  writingRules: string;
};

type AgentProfilePlatformOverrideProps = {
  enabledModels: string[];
  label: string;
  override: PlatformOverrideFormState;
  platformValue: string;
  onChange: (
    platform: string,
    key: keyof PlatformOverrideFormState,
    value: string,
  ) => void;
};

export default function AgentProfilePlatformOverride({
  enabledModels,
  label,
  override,
  platformValue,
  onChange,
}: AgentProfilePlatformOverrideProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{label}</h4>
        <span className="text-xs text-muted-foreground">Optional override</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-canonical-source`}
          >
            Voice Source Override
          </label>
          <Select
            value={override.canonicalSource || AUTO_MODEL_SELECT_VALUE}
            onValueChange={(value) =>
              onChange(
                platformValue,
                'canonicalSource',
                value === AUTO_MODEL_SELECT_VALUE ? '' : value,
              )
            }
          >
            <SelectTrigger
              id={`${platformValue}-canonical-source`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                Inherit brand voice source
              </SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="founder">Founder</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-default-model`}
          >
            Model Override
          </label>
          <Select
            value={override.defaultModel || AUTO_MODEL_SELECT_VALUE}
            onValueChange={(value) =>
              onChange(
                platformValue,
                'defaultModel',
                value === AUTO_MODEL_SELECT_VALUE ? '' : value,
              )
            }
          >
            <SelectTrigger
              id={`${platformValue}-default-model`}
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
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-tone`}
          >
            Tone Override
          </label>
          <Input
            id={`${platformValue}-tone`}
            value={override.tone}
            onChange={(event) =>
              onChange(platformValue, 'tone', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-style`}
          >
            Style Override
          </label>
          <Input
            id={`${platformValue}-style`}
            value={override.style}
            onChange={(event) =>
              onChange(platformValue, 'style', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-frequency`}
          >
            Frequency Override
          </label>
          <Input
            id={`${platformValue}-frequency`}
            value={override.frequency}
            onChange={(event) =>
              onChange(platformValue, 'frequency', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-audience`}
          >
            Audience Override
          </label>
          <Input
            id={`${platformValue}-audience`}
            placeholder="developers, operators"
            value={override.audience}
            onChange={(event) =>
              onChange(platformValue, 'audience', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-goals`}
          >
            Goals Override
          </label>
          <Input
            id={`${platformValue}-goals`}
            placeholder="engagement, leads"
            value={override.goals}
            onChange={(event) =>
              onChange(platformValue, 'goals', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-messaging-pillars`}
          >
            Messaging Pillars Override
          </label>
          <Input
            id={`${platformValue}-messaging-pillars`}
            placeholder="clarity, proof"
            value={override.messagingPillars}
            onChange={(event) =>
              onChange(platformValue, 'messagingPillars', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-approved-hooks`}
          >
            Approved Hooks Override
          </label>
          <Input
            id={`${platformValue}-approved-hooks`}
            placeholder="clarity, proof"
            value={override.approvedHooks}
            onChange={(event) =>
              onChange(platformValue, 'approvedHooks', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-banned-phrases`}
          >
            Banned Phrases Override
          </label>
          <Input
            id={`${platformValue}-banned-phrases`}
            placeholder="clickbait, jargon"
            value={override.bannedPhrases}
            onChange={(event) =>
              onChange(platformValue, 'bannedPhrases', event.target.value)
            }
          />
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-do-not-sound-like`}
          >
            Avoid Override
          </label>
          <Input
            id={`${platformValue}-do-not-sound-like`}
            placeholder="clickbait, jargon"
            value={override.doNotSoundLike}
            onChange={(event) =>
              onChange(platformValue, 'doNotSoundLike', event.target.value)
            }
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-content-types`}
          >
            Content Types Override
          </label>
          <Input
            id={`${platformValue}-content-types`}
            placeholder="thread, reel, explainer"
            value={override.contentTypes}
            onChange={(event) =>
              onChange(platformValue, 'contentTypes', event.target.value)
            }
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-writing-rules`}
          >
            Writing Rules Override
          </label>
          <Input
            id={`${platformValue}-writing-rules`}
            placeholder="Lead with a claim, use proof"
            value={override.writingRules}
            onChange={(event) =>
              onChange(platformValue, 'writingRules', event.target.value)
            }
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-persona`}
          >
            Persona Override
          </label>
          <Textarea
            id={`${platformValue}-persona`}
            className="min-h-[90px]"
            value={override.persona}
            onChange={(event) =>
              onChange(platformValue, 'persona', event.target.value)
            }
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-sample-output`}
          >
            Sample Output Override
          </label>
          <Textarea
            id={`${platformValue}-sample-output`}
            className="min-h-[90px]"
            placeholder="Short example of how this platform-specific voice should sound."
            value={override.sampleOutput}
            onChange={(event) =>
              onChange(platformValue, 'sampleOutput', event.target.value)
            }
          />
        </div>

        <div className="md:col-span-2">
          <label
            className="mb-1 block text-xs font-medium"
            htmlFor={`${platformValue}-exemplar-texts`}
          >
            Exemplar Texts Override
          </label>
          <Input
            id={`${platformValue}-exemplar-texts`}
            placeholder="Short example of a winning post."
            value={override.exemplarTexts}
            onChange={(event) =>
              onChange(platformValue, 'exemplarTexts', event.target.value)
            }
          />
        </div>
      </div>
    </div>
  );
}
