import { AgentType } from '..';

export interface AgentProgramTemplateRole {
  agentType: AgentType;
  dailyCreditBudget: number;
  defaultLabel: string;
  description: string;
  displayRole: string;
  id: string;
  platforms: string[];
  teamGroup: string;
}

export interface AgentProgramTemplate {
  description: string;
  id: string;
  label: string;
  roles: AgentProgramTemplateRole[];
}

/**
 * Server-owned Program templates. The same catalog drives the Programs UI and
 * the atomic API command so a client cannot silently redefine a team recipe.
 */
export const AGENT_PROGRAM_TEMPLATES: AgentProgramTemplate[] = [
  {
    description:
      'A compact creator team with strategy, short-form, distribution, and design coverage.',
    id: 'creator-studio',
    label: 'Creator Studio team',
    roles: [
      {
        agentType: AgentType.ARTICLE_WRITER,
        dailyCreditBudget: 120,
        defaultLabel: 'Script Writer',
        description: 'Develops hooks, scripts, and long-form narrative drafts.',
        displayRole: 'Script Writer',
        id: 'script-writer',
        platforms: ['instagram', 'youtube'],
        teamGroup: 'Strategy',
      },
      {
        agentType: AgentType.VIDEO_CREATOR,
        dailyCreditBudget: 180,
        defaultLabel: 'Instagram Short Creator',
        description:
          'Produces short-form creator videos for Instagram and TikTok.',
        displayRole: 'Instagram Short Creator',
        id: 'instagram-short-creator',
        platforms: ['instagram', 'tiktok'],
        teamGroup: 'Production',
      },
      {
        agentType: AgentType.X_CONTENT,
        dailyCreditBudget: 80,
        defaultLabel: 'X/Twitter Writer',
        description:
          'Turns ideas into posts, threads, and fast platform-native copy.',
        displayRole: 'X/Twitter Writer',
        id: 'x-twitter-writer',
        platforms: ['twitter'],
        teamGroup: 'Distribution',
      },
      {
        agentType: AgentType.IMAGE_CREATOR,
        dailyCreditBudget: 140,
        defaultLabel: 'Image/Carousel Creator',
        description: 'Builds carousels, stills, and visual support assets.',
        displayRole: 'Image/Carousel Creator',
        id: 'image-carousel-creator',
        platforms: ['instagram', 'linkedin'],
        teamGroup: 'Production',
      },
    ],
  },
];

export function getAgentProgramTemplate(
  templateId: string,
): AgentProgramTemplate | undefined {
  return AGENT_PROGRAM_TEMPLATES.find((template) => template.id === templateId);
}
