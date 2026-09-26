import { SCHEDULE_TODAYS_TWEETS_PROMPT } from '@genfeedai/agent/constants/agent-quick-prompts.constant';
import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';

/**
 * Static head of the Agent `/` palette: composer actions that navigate, plus a
 * few prompt starters. The skill catalog is appended at runtime by
 * `useSurfaceSkillCommands`, so this list stays small and surface-specific.
 */
export const AGENT_SLASH_COMMANDS: PromptCommand[] = [
  ...CONVERSATION_COMPOSER_ACTIONS.map(
    (action): PromptCommand => ({
      actionName: action.name,
      description: action.description,
      kind: 'action',
      label: action.label,
      name: action.name,
    }),
  ),
  // Named `interview` rather than `brand-interview` so the shortest thing an
  // operator types finds it. It seeds a prompt as well as picking the skill,
  // so `/interview` + Enter starts the interview outright.
  {
    description: 'Get grilled on your brand voice and content strategy',
    kind: 'skill',
    label: 'Interview',
    name: 'interview',
    promptPrefix:
      'Start the brand interview. Grill me on my brand voice, audience, and content strategy, and fill the gaps in my brand profile from my answers.',
    skillSlug: 'brand-interview',
  },
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
  // Full prompt rather than a prefix: `/tweets-today` + Enter sends it as-is.
  {
    description: 'Schedule one X post per hour for the rest of today',
    kind: 'prompt',
    label: "Today's Tweets",
    name: 'tweets-today',
    promptPrefix: SCHEDULE_TODAYS_TWEETS_PROMPT,
  },
];
