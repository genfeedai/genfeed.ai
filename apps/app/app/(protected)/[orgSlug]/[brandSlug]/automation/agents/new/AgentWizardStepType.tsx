import { AgentType, ButtonVariant } from '@genfeedai/contracts';
import type { AgentOptionPickerItem } from '@props/automation/agent-option-picker.props';
import type { Props } from '@props/automation/agent-wizard-step-type.props';
import { Button } from '@ui/primitives/button';
import { ArrowRight } from 'lucide-react';
import AgentOptionPicker from '../AgentOptionPicker';
import {
  AGENT_TYPE_DEFAULTS,
  AGENT_TYPE_LABELS,
  getAgentTypeIcon,
} from '../agent-type-display';

function formatDailyBudget(credits: number) {
  return `${credits} credits / day`;
}

function typeOption(
  type: AgentType,
  description: string,
): AgentOptionPickerItem<AgentType> {
  const Icon = getAgentTypeIcon(type);
  return {
    description,
    icon: <Icon className="size-4" />,
    label: AGENT_TYPE_LABELS[type],
    meta: formatDailyBudget(AGENT_TYPE_DEFAULTS[type].defaultBudget),
    value: type,
  };
}

const AGENT_TYPES: AgentOptionPickerItem<AgentType>[] = [
  typeOption(AgentType.GENERAL, 'Versatile agent for any content type'),
  typeOption(AgentType.X_CONTENT, 'Optimized for Twitter/X threads and posts'),
  typeOption(
    AgentType.IMAGE_CREATOR,
    'Generates images for social media content',
  ),
  typeOption(AgentType.VIDEO_CREATOR, 'Creates short-form video content'),
  typeOption(AgentType.AI_AVATAR, 'AI-powered avatar for creator content'),
  typeOption(
    AgentType.ARTICLE_WRITER,
    'Expert long-form articles and blog content writer',
  ),
  typeOption(
    AgentType.LINKEDIN_CONTENT,
    'LinkedIn thought leadership and professional posts',
  ),
  typeOption(
    AgentType.ADS_SCRIPT_WRITER,
    'Video ad scripts and performance marketing copy',
  ),
  typeOption(
    AgentType.SHORT_FORM_WRITER,
    'TikTok/IG hooks, captions, and text overlays',
  ),
  typeOption(
    AgentType.CTA_CONTENT,
    'CTAs, conversion copy, and action-driving content',
  ),
  typeOption(
    AgentType.YOUTUBE_SCRIPT,
    'YouTube scripts, titles, descriptions, and Shorts',
  ),
];

export default function AgentWizardStepType({
  selectedAgentType,
  onSelectType,
  onNext,
}: Props) {
  return (
    <div className="space-y-4">
      <AgentOptionPicker
        label="Select the type of agent you want to create"
        onValueChange={onSelectType}
        options={AGENT_TYPES}
        value={selectedAgentType}
      />
      <div className="flex justify-end pt-2">
        <Button
          label={
            <>
              Configure <ArrowRight />
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onNext}
        />
      </div>
    </div>
  );
}
