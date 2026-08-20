'use client';

import { AgentType, ButtonVariant } from '@genfeedai/enums';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Button } from '@ui/primitives/button';
import {
  ArrowRight,
  Cpu,
  FileText,
  Image,
  Megaphone,
  Sparkles,
  User,
  Video,
  Zap,
} from 'lucide-react';

import AgentOptionPicker, {
  type AgentOptionPickerItem,
} from '../AgentOptionPicker';

function formatDailyBudget(credits: number) {
  return `${credits} credits / day`;
}

const AGENT_TYPES: AgentOptionPickerItem<AgentType>[] = [
  {
    description: 'Versatile agent for any content type',
    icon: <Cpu className="size-4" />,
    label: 'General',
    meta: formatDailyBudget(100),
    value: AgentType.GENERAL,
  },
  {
    description: 'Optimized for Twitter/X threads and posts',
    icon: <XTwitterIcon className="size-4" />,
    label: 'X Content',
    meta: formatDailyBudget(50),
    value: AgentType.X_CONTENT,
  },
  {
    description: 'Generates images for social media content',
    icon: <Image className="size-4" />,
    label: 'Image Creator',
    meta: formatDailyBudget(200),
    value: AgentType.IMAGE_CREATOR,
  },
  {
    description: 'Creates short-form video content',
    icon: <Video className="size-4" />,
    label: 'Video Creator',
    meta: formatDailyBudget(500),
    value: AgentType.VIDEO_CREATOR,
  },
  {
    description: 'AI-powered avatar for creator content',
    icon: <User className="size-4" />,
    label: 'AI Avatar',
    meta: formatDailyBudget(300),
    value: AgentType.AI_AVATAR,
  },
  {
    description: 'Expert long-form articles and blog content writer',
    icon: <FileText className="size-4" />,
    label: 'Article Writer',
    meta: formatDailyBudget(500),
    value: AgentType.ARTICLE_WRITER,
  },
  {
    description: 'LinkedIn thought leadership and professional posts',
    icon: <LinkedinIcon className="size-4" />,
    label: 'LinkedIn Copywriter',
    meta: formatDailyBudget(200),
    value: AgentType.LINKEDIN_CONTENT,
  },
  {
    description: 'Video ad scripts and performance marketing copy',
    icon: <Megaphone className="size-4" />,
    label: 'Ads Script Writer',
    meta: formatDailyBudget(300),
    value: AgentType.ADS_SCRIPT_WRITER,
  },
  {
    description: 'TikTok/IG hooks, captions, and text overlays',
    icon: <Zap className="size-4" />,
    label: 'Short-Form Writer',
    meta: formatDailyBudget(200),
    value: AgentType.SHORT_FORM_WRITER,
  },
  {
    description: 'CTAs, conversion copy, and action-driving content',
    icon: <Sparkles className="size-4" />,
    label: 'CTA / Conversion',
    meta: formatDailyBudget(150),
    value: AgentType.CTA_CONTENT,
  },
  {
    description: 'YouTube scripts, titles, descriptions, and Shorts',
    icon: <YoutubeIcon className="size-4" />,
    label: 'YouTube Script',
    meta: formatDailyBudget(400),
    value: AgentType.YOUTUBE_SCRIPT,
  },
];

type Props = {
  selectedAgentType: AgentType;
  onSelectType: (type: AgentType) => void;
  onNext: () => void;
};

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
