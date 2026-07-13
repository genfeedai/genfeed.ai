import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { ConversationComposerActionName } from '@genfeedai/agent/models/conversation-composer.model';

export interface AgentSlashCommand {
  description: string;
  kind: 'action' | 'prompt';
  label: string;
  name: string;
  actionName?: ConversationComposerActionName;
  promptPrefix?: string;
}

export const AGENT_SLASH_COMMANDS: AgentSlashCommand[] = [
  ...CONVERSATION_COMPOSER_ACTIONS.map((action) => ({
    actionName: action.name,
    description: action.description,
    kind: 'action' as const,
    label: action.label,
    name: action.name,
  })),
  {
    description: 'Create an AI-generated image',
    kind: 'prompt',
    label: 'Generate Image',
    name: 'generate-image',
    promptPrefix: 'Generate an image: ',
  },
  {
    description: 'Draft a social media post',
    kind: 'prompt',
    label: 'Create Post',
    name: 'create-post',
    promptPrefix: 'Create a post for ',
  },
  {
    description: 'Draft a scheduling request as a prompt',
    kind: 'prompt',
    label: 'Schedule Prompt',
    name: 'schedule-post',
    promptPrefix: 'Schedule a post for ',
  },
  {
    description: 'Ask the agent to analyze content performance',
    kind: 'prompt',
    label: 'Analyze Prompt',
    name: 'analyze-performance',
    promptPrefix: 'Analyze performance of ',
  },
  {
    description: 'Write a caption',
    kind: 'prompt',
    label: 'Caption',
    name: 'caption',
    promptPrefix: 'Write a caption for ',
  },
  {
    description: 'Suggest hashtags',
    kind: 'prompt',
    label: 'Hashtags',
    name: 'hashtags',
    promptPrefix: 'Suggest hashtags for ',
  },
  {
    description: 'Brainstorm content ideas',
    kind: 'prompt',
    label: 'Ideas',
    name: 'ideas',
    promptPrefix: 'Generate content ideas for ',
  },
  {
    description: 'Adapt for another platform',
    kind: 'prompt',
    label: 'Repurpose',
    name: 'repurpose',
    promptPrefix: 'Repurpose this content: ',
  },
  {
    description: 'Find trending topics',
    kind: 'prompt',
    label: 'Trends',
    name: 'trends',
    promptPrefix: 'Find trending topics for ',
  },
  {
    description: 'Generate multiple posts',
    kind: 'prompt',
    label: 'Batch Generate',
    name: 'batch',
    promptPrefix: 'Generate a batch of posts: ',
  },
];
