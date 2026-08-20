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

import { SelectCardButton } from './AgentWizardHelpers';

const AGENT_TYPES: {
  type: AgentType;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultBudget: number;
  platforms: string[];
}[] = [
  {
    defaultBudget: 100,
    description: 'Versatile agent for any content type',
    icon: <Cpu className="size-6" />,
    label: 'General',
    platforms: ['twitter', 'instagram', 'linkedin'],
    type: AgentType.GENERAL,
  },
  {
    defaultBudget: 50,
    description: 'Optimized for Twitter/X threads and posts',
    icon: <XTwitterIcon className="size-5" />,
    label: 'X Content',
    platforms: ['twitter'],
    type: AgentType.X_CONTENT,
  },
  {
    defaultBudget: 200,
    description: 'Generates images for social media content',
    icon: <Image className="size-6" />,
    label: 'Image Creator',
    platforms: ['instagram', 'twitter'],
    type: AgentType.IMAGE_CREATOR,
  },
  {
    defaultBudget: 500,
    description: 'Creates short-form video content',
    icon: <Video className="size-6" />,
    label: 'Video Creator',
    platforms: ['tiktok', 'youtube', 'instagram'],
    type: AgentType.VIDEO_CREATOR,
  },
  {
    defaultBudget: 300,
    description: 'AI-powered avatar for creator content',
    icon: <User className="size-6" />,
    label: 'AI Avatar',
    platforms: ['tiktok', 'youtube'],
    type: AgentType.AI_AVATAR,
  },
  {
    defaultBudget: 500,
    description: 'Expert long-form articles and blog content writer',
    icon: <FileText className="size-6" />,
    label: 'Article Writer',
    platforms: ['linkedin', 'wordpress'],
    type: AgentType.ARTICLE_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'LinkedIn thought leadership and professional posts',
    icon: <LinkedinIcon className="size-5" />,
    label: 'LinkedIn Copywriter',
    platforms: ['linkedin'],
    type: AgentType.LINKEDIN_CONTENT,
  },
  {
    defaultBudget: 300,
    description: 'Video ad scripts and performance marketing copy',
    icon: <Megaphone className="size-6" />,
    label: 'Ads Script Writer',
    platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
    type: AgentType.ADS_SCRIPT_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'TikTok/IG hooks, captions, and text overlays',
    icon: <Zap className="size-6" />,
    label: 'Short-Form Writer',
    platforms: ['tiktok', 'instagram'],
    type: AgentType.SHORT_FORM_WRITER,
  },
  {
    defaultBudget: 150,
    description: 'CTAs, conversion copy, and action-driving content',
    icon: <Sparkles className="size-6" />,
    label: 'CTA / Conversion',
    platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
    type: AgentType.CTA_CONTENT,
  },
  {
    defaultBudget: 400,
    description: 'YouTube scripts, titles, descriptions, and Shorts',
    icon: <YoutubeIcon className="size-5" />,
    label: 'YouTube Script',
    platforms: ['youtube'],
    type: AgentType.YOUTUBE_SCRIPT,
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
      <p className="text-sm text-foreground/60">
        Select the type of agent you want to create
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AGENT_TYPES.map((config) => (
          <SelectCardButton
            key={config.type}
            isSelected={selectedAgentType === config.type}
            onClick={() => onSelectType(config.type)}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-foreground/70">{config.icon}</span>
              <span className="font-medium text-sm">{config.label}</span>
            </div>
            <p className="text-xs text-foreground/50">{config.description}</p>
            <p className="mt-2 text-xs text-foreground/40">
              Default budget: {config.defaultBudget} credits/day
            </p>
          </SelectCardButton>
        ))}
      </div>
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
