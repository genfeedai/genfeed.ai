import { AgentType, Platform } from '@genfeedai/contracts';
import { PUBLISH_PLATFORMS } from '@genfeedai/contracts/constants';
import {
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { AgentTypeIcon } from '@genfeedai/props/automation/agent-type-display.props';
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

export type { AgentTypeIcon };

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
  { defaultBudget: number; platforms: Platform[] }
> = {
  [AgentType.GENERAL]: {
    defaultBudget: 100,
    platforms: [Platform.TWITTER, Platform.INSTAGRAM, Platform.LINKEDIN],
  },
  [AgentType.X_CONTENT]: { defaultBudget: 50, platforms: [Platform.TWITTER] },
  [AgentType.IMAGE_CREATOR]: {
    defaultBudget: 200,
    platforms: [Platform.INSTAGRAM, Platform.TWITTER],
  },
  [AgentType.VIDEO_CREATOR]: {
    defaultBudget: 500,
    platforms: [Platform.TIKTOK, Platform.YOUTUBE, Platform.INSTAGRAM],
  },
  [AgentType.AI_AVATAR]: {
    defaultBudget: 300,
    platforms: [Platform.TIKTOK, Platform.YOUTUBE],
  },
  [AgentType.ARTICLE_WRITER]: {
    defaultBudget: 500,
    platforms: [Platform.LINKEDIN, Platform.WORDPRESS],
  },
  [AgentType.LINKEDIN_CONTENT]: {
    defaultBudget: 200,
    platforms: [Platform.LINKEDIN],
  },
  [AgentType.ADS_SCRIPT_WRITER]: {
    defaultBudget: 300,
    platforms: [
      Platform.INSTAGRAM,
      Platform.TIKTOK,
      Platform.YOUTUBE,
      Platform.FACEBOOK,
    ],
  },
  [AgentType.SHORT_FORM_WRITER]: {
    defaultBudget: 200,
    platforms: [Platform.TIKTOK, Platform.INSTAGRAM],
  },
  [AgentType.CTA_CONTENT]: {
    defaultBudget: 150,
    platforms: [
      Platform.INSTAGRAM,
      Platform.LINKEDIN,
      Platform.TWITTER,
      Platform.YOUTUBE,
    ],
  },
  [AgentType.YOUTUBE_SCRIPT]: {
    defaultBudget: 400,
    platforms: [Platform.YOUTUBE],
  },
  [AgentType.BRAND_INTERVIEW]: {
    defaultBudget: 200,
    platforms: [Platform.LINKEDIN, Platform.YOUTUBE],
  },
};

const publishPlatformValues = {
  [Platform.YOUTUBE]: Platform.YOUTUBE,
  [Platform.TIKTOK]: Platform.TIKTOK,
  [Platform.INSTAGRAM]: Platform.INSTAGRAM,
  [Platform.TWITTER]: Platform.TWITTER,
  [Platform.LINKEDIN]: Platform.LINKEDIN,
};

export const AGENT_PLATFORM_OPTIONS: readonly Platform[] = [
  ...new Set([
    ...PUBLISH_PLATFORMS.map(({ platform }) => publishPlatformValues[platform]),
    ...Object.values(AGENT_TYPE_DEFAULTS).flatMap(({ platforms }) => platforms),
  ]),
];

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
