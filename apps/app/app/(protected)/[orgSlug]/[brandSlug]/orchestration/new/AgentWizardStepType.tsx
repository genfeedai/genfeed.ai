'use client';

import { AgentType, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import {
  HiArrowRight,
  HiOutlineBolt,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
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
    icon: <HiOutlineCpuChip className="size-6" />,
    label: 'General',
    platforms: ['twitter', 'instagram', 'linkedin'],
    type: AgentType.GENERAL,
  },
  {
    defaultBudget: 50,
    description: 'Optimized for Twitter/X threads and posts',
    icon: <FaXTwitter className="size-5" />,
    label: 'X Content',
    platforms: ['twitter'],
    type: AgentType.X_CONTENT,
  },
  {
    defaultBudget: 200,
    description: 'Generates images for social media content',
    icon: <HiOutlinePhoto className="size-6" />,
    label: 'Image Creator',
    platforms: ['instagram', 'twitter'],
    type: AgentType.IMAGE_CREATOR,
  },
  {
    defaultBudget: 500,
    description: 'Creates short-form video content',
    icon: <HiOutlineVideoCamera className="size-6" />,
    label: 'Video Creator',
    platforms: ['tiktok', 'youtube', 'instagram'],
    type: AgentType.VIDEO_CREATOR,
  },
  {
    defaultBudget: 300,
    description: 'AI-powered avatar for creator content',
    icon: <HiOutlineUser className="size-6" />,
    label: 'AI Avatar',
    platforms: ['tiktok', 'youtube'],
    type: AgentType.AI_AVATAR,
  },
  {
    defaultBudget: 500,
    description: 'Expert long-form articles and blog content writer',
    icon: <HiOutlineDocumentText className="size-6" />,
    label: 'Article Writer',
    platforms: ['linkedin', 'wordpress'],
    type: AgentType.ARTICLE_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'LinkedIn thought leadership and professional posts',
    icon: <FaLinkedin className="size-5" />,
    label: 'LinkedIn Copywriter',
    platforms: ['linkedin'],
    type: AgentType.LINKEDIN_CONTENT,
  },
  {
    defaultBudget: 300,
    description: 'Video ad scripts and performance marketing copy',
    icon: <HiOutlineMegaphone className="size-6" />,
    label: 'Ads Script Writer',
    platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
    type: AgentType.ADS_SCRIPT_WRITER,
  },
  {
    defaultBudget: 200,
    description: 'TikTok/IG hooks, captions, and text overlays',
    icon: <HiOutlineBolt className="size-6" />,
    label: 'Short-Form Writer',
    platforms: ['tiktok', 'instagram'],
    type: AgentType.SHORT_FORM_WRITER,
  },
  {
    defaultBudget: 150,
    description: 'CTAs, conversion copy, and action-driving content',
    icon: <HiOutlineSparkles className="size-6" />,
    label: 'CTA / Conversion',
    platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
    type: AgentType.CTA_CONTENT,
  },
  {
    defaultBudget: 400,
    description: 'YouTube scripts, titles, descriptions, and Shorts',
    icon: <FaYoutube className="size-5" />,
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
              Pick Brand <HiArrowRight />
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onNext}
        />
      </div>
    </div>
  );
}
