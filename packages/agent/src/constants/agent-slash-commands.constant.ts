export interface AgentSlashCommand {
  name: string;
  label: string;
  description: string;
  promptPrefix: string;
}

export const AGENT_SLASH_COMMANDS: AgentSlashCommand[] = [
  {
    description: 'Create an AI-generated image',
    label: 'Generate Image',
    name: 'generate-image',
    promptPrefix: 'Generate an image: ',
  },
  {
    description: 'Draft a social media post',
    label: 'Create Post',
    name: 'create-post',
    promptPrefix: 'Create a post for ',
  },
  {
    description: 'Schedule a post',
    label: 'Schedule',
    name: 'schedule',
    promptPrefix: 'Schedule a post for ',
  },
  {
    description: 'Check content performance',
    label: 'Analyze',
    name: 'analyze',
    promptPrefix: 'Analyze performance of ',
  },
  {
    description: 'Write a caption',
    label: 'Caption',
    name: 'caption',
    promptPrefix: 'Write a caption for ',
  },
  {
    description: 'Suggest hashtags',
    label: 'Hashtags',
    name: 'hashtags',
    promptPrefix: 'Suggest hashtags for ',
  },
  {
    description: 'Brainstorm content ideas',
    label: 'Ideas',
    name: 'ideas',
    promptPrefix: 'Generate content ideas for ',
  },
  {
    description: 'Adapt for another platform',
    label: 'Repurpose',
    name: 'repurpose',
    promptPrefix: 'Repurpose this content: ',
  },
  {
    description: 'Find trending topics',
    label: 'Trends',
    name: 'trends',
    promptPrefix: 'Find trending topics for ',
  },
  {
    description: 'Generate multiple posts',
    label: 'Batch Generate',
    name: 'batch',
    promptPrefix: 'Generate a batch of posts: ',
  },
];
