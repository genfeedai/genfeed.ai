import { AgentType } from '@genfeedai/contracts';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import {
  Cpu,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  User,
  Video,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type AgentTypeIcon = ComponentType<{ className?: string }>;

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  [AgentType.GENERAL]: 'General',
  [AgentType.X_CONTENT]: 'X Content',
  [AgentType.IMAGE_CREATOR]: 'Image Creator',
  [AgentType.VIDEO_CREATOR]: 'Video Creator',
  [AgentType.AI_AVATAR]: 'AI Avatar',
  [AgentType.ARTICLE_WRITER]: 'Article Writer',
  [AgentType.LINKEDIN_CONTENT]: 'LinkedIn Copywriter',
  [AgentType.ADS_SCRIPT_WRITER]: 'Ads Script Writer',
  [AgentType.SHORT_FORM_WRITER]: 'Short-Form Writer',
  [AgentType.CTA_CONTENT]: 'CTA / Conversion',
  [AgentType.YOUTUBE_SCRIPT]: 'YouTube Script',
  [AgentType.BRAND_INTERVIEW]: 'Brand Interview',
};

export const AGENT_TYPE_ICON_COMPONENTS: Record<AgentType, AgentTypeIcon> = {
  [AgentType.GENERAL]: Cpu,
  [AgentType.X_CONTENT]: XTwitterIcon,
  [AgentType.IMAGE_CREATOR]: ImageIcon,
  [AgentType.VIDEO_CREATOR]: Video,
  [AgentType.AI_AVATAR]: User,
  [AgentType.ARTICLE_WRITER]: FileText,
  [AgentType.LINKEDIN_CONTENT]: LinkedinIcon,
  [AgentType.ADS_SCRIPT_WRITER]: Megaphone,
  [AgentType.SHORT_FORM_WRITER]: Zap,
  [AgentType.CTA_CONTENT]: Sparkles,
  [AgentType.YOUTUBE_SCRIPT]: YoutubeIcon,
  [AgentType.BRAND_INTERVIEW]: Sparkles,
};

export const AGENT_TYPE_DEFAULTS: Record<
  AgentType,
  { defaultBudget: number; platforms: string[] }
> = {
  [AgentType.GENERAL]: {
    defaultBudget: 100,
    platforms: ['twitter', 'instagram', 'linkedin'],
  },
  [AgentType.X_CONTENT]: { defaultBudget: 50, platforms: ['twitter'] },
  [AgentType.IMAGE_CREATOR]: {
    defaultBudget: 200,
    platforms: ['instagram', 'twitter'],
  },
  [AgentType.VIDEO_CREATOR]: {
    defaultBudget: 500,
    platforms: ['tiktok', 'youtube', 'instagram'],
  },
  [AgentType.AI_AVATAR]: {
    defaultBudget: 300,
    platforms: ['tiktok', 'youtube'],
  },
  [AgentType.ARTICLE_WRITER]: {
    defaultBudget: 500,
    platforms: ['linkedin', 'wordpress'],
  },
  [AgentType.LINKEDIN_CONTENT]: {
    defaultBudget: 200,
    platforms: ['linkedin'],
  },
  [AgentType.ADS_SCRIPT_WRITER]: {
    defaultBudget: 300,
    platforms: ['instagram', 'tiktok', 'youtube', 'facebook'],
  },
  [AgentType.SHORT_FORM_WRITER]: {
    defaultBudget: 200,
    platforms: ['tiktok', 'instagram'],
  },
  [AgentType.CTA_CONTENT]: {
    defaultBudget: 150,
    platforms: ['instagram', 'linkedin', 'twitter', 'youtube'],
  },
  [AgentType.YOUTUBE_SCRIPT]: {
    defaultBudget: 400,
    platforms: ['youtube'],
  },
  [AgentType.BRAND_INTERVIEW]: {
    defaultBudget: 200,
    platforms: ['linkedin', 'youtube'],
  },
};

export const AGENT_TYPE_OPTIONS = (Object.values(AgentType) as AgentType[]).map(
  (value) => ({
    label: AGENT_TYPE_LABELS[value],
    value,
  }),
);

export function getAgentTypeIcon(agentType: string | undefined): AgentTypeIcon {
  if (!agentType) {
    return Cpu;
  }
  return AGENT_TYPE_ICON_COMPONENTS[agentType as AgentType] ?? Cpu;
}

export function getAgentTypeLabel(agentType: string | undefined): string {
  if (!agentType) {
    return '';
  }
  return AGENT_TYPE_LABELS[agentType as AgentType] ?? agentType;
}
