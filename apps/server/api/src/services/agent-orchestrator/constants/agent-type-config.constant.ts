import { ORCHESTRATOR_AGENT_TYPE } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentType } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';

const CREATE_LIVESTREAM_BOT_TOOL = 'create_livestream_bot' as AgentToolName;
const MANAGE_LIVESTREAM_BOT_TOOL = 'manage_livestream_bot' as AgentToolName;
const LIST_ADS_RESEARCH_TOOL = 'list_ads_research' as AgentToolName;
const GET_AD_RESEARCH_DETAIL_TOOL = 'get_ad_research_detail' as AgentToolName;
const CREATE_AD_REMIX_WORKFLOW_TOOL =
  'create_ad_remix_workflow' as AgentToolName;
const GENERATE_AD_PACK_TOOL = 'generate_ad_pack' as AgentToolName;
const PREPARE_AD_LAUNCH_REVIEW_TOOL =
  'prepare_ad_launch_review' as AgentToolName;

export interface AgentTypeConfig {
  defaultDailyCreditBudget: number;
  defaultModel: string;
  defaultTools: AgentToolName[];
  systemPromptSuffix: string;
}

const SHARED_READ_TOOLS: AgentToolName[] = [
  AgentToolName.GET_ANALYTICS,
  AgentToolName.GET_CREDITS_BALANCE,
  AgentToolName.GET_TRENDS,
  AgentToolName.LIST_BRANDS,
  AgentToolName.LIST_POSTS,
  AgentToolName.LIST_REVIEW_QUEUE,
  AgentToolName.GET_CONNECTION_STATUS,
  AgentToolName.UPDATE_STRATEGY_STATE,
  AgentToolName.GET_APPROVAL_SUMMARY,
  AgentToolName.ANALYZE_PERFORMANCE,
  AgentToolName.GET_CONTENT_CALENDAR,
  'capture_memory' as AgentToolName,
  AgentToolName.CREATE_WORKFLOW,
  CREATE_LIVESTREAM_BOT_TOOL,
  MANAGE_LIVESTREAM_BOT_TOOL,
  LIST_ADS_RESEARCH_TOOL,
  GET_AD_RESEARCH_DETAIL_TOOL,
  CREATE_AD_REMIX_WORKFLOW_TOOL,
  GENERATE_AD_PACK_TOOL,
  PREPARE_AD_LAUNCH_REVIEW_TOOL,
  'rate_content' as AgentToolName,
  'rate_ingredient' as AgentToolName,
  'get_top_ingredients' as AgentToolName,
  'replicate_top_ingredient' as AgentToolName,
];

export const AGENT_TYPE_CONFIGS: Record<AgentType, AgentTypeConfig> = {
  [AgentType.GENERAL]: {
    defaultDailyCreditBudget: 100,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...Object.values(AgentToolName),
      'capture_memory' as AgentToolName,
      LIST_ADS_RESEARCH_TOOL,
      GET_AD_RESEARCH_DETAIL_TOOL,
      CREATE_AD_REMIX_WORKFLOW_TOOL,
      GENERATE_AD_PACK_TOOL,
      PREPARE_AD_LAUNCH_REVIEW_TOOL,
      'rate_content' as AgentToolName,
      'rate_ingredient' as AgentToolName,
      'get_top_ingredients' as AgentToolName,
      'replicate_top_ingredient' as AgentToolName,
    ],
    systemPromptSuffix: '',
  },

  [AgentType.X_CONTENT]: {
    defaultDailyCreditBudget: 100,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.RESOLVE_HANDLE,
      AgentToolName.DISCOVER_ENGAGEMENTS,
      AgentToolName.DRAFT_ENGAGEMENT_REPLY,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: X/Twitter Content Agent
You are a specialized X/Twitter content agent. Your primary mission is to grow the brand's presence on X through consistent, high-quality content and strategic engagement.

Focus areas:
- Create threads, posts, and replies that match the brand voice
- Monitor trending topics and hashtags relevant to the niche
- Engage authentically with the community — replies should feel human, not automated
- Optimize post timing based on audience activity patterns
- Batch-create content for the week ahead when possible

X-specific guidelines:
- Keep posts under 280 characters unless creating a thread
- Use 1-3 relevant hashtags max — no hashtag stuffing
- For threads: hook in the first post, value in the middle, CTA at the end
- Prioritize engagement rate over raw impressions`,
  },

  [AgentType.IMAGE_CREATOR]: {
    defaultDailyCreditBudget: 500,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_IMAGE,
      AgentToolName.REFRAME_IMAGE,
      AgentToolName.UPSCALE_IMAGE,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.PREPARE_WORKFLOW_TRIGGER,
      AgentToolName.PREPARE_VOICE_CLONE,
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Image Creator Agent
You are a specialized image generation agent focused on producing brand-consistent visual content.

Focus areas:
- Generate images that align with the brand's visual identity and color palette
- Maintain consistency across image series and campaigns
- Optimize prompts for the selected model to maximize quality
- Produce variations for A/B testing
- Upscale high-performing images for use across platforms

Image guidelines:
- Always reference brand colors, fonts, and visual style from brand context
- Generate in the correct aspect ratios for the target platform
- Create detailed, specific prompts — avoid vague instructions
- For product images: clean backgrounds, proper lighting, brand elements visible`,
  },

  [AgentType.VIDEO_CREATOR]: {
    defaultDailyCreditBudget: 800,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_VIDEO,
      AgentToolName.GENERATE_IMAGE,
      AgentToolName.GENERATE_VOICE,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.PREPARE_WORKFLOW_TRIGGER,
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Video Creator Agent
You are a specialized short-form video content agent for platforms like TikTok, Instagram Reels, and YouTube Shorts.

Focus areas:
- Create compelling short-form videos (15-60 seconds) that drive engagement
- Develop video concepts aligned with current trends in the niche
- Generate voiceovers and scripts that match the brand voice
- Produce thumbnail images optimized for click-through rates
- Schedule video posts at peak engagement windows

Video guidelines:
- Hook viewers in the first 3 seconds
- Design for vertical format (9:16 aspect ratio) by default
- Pair videos with strong captions and CTAs
- Create series-based content for consistent audience building`,
  },

  [AgentType.AI_AVATAR]: {
    defaultDailyCreditBudget: 600,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_AS_IDENTITY,
      AgentToolName.GENERATE_VIDEO,
      AgentToolName.GENERATE_IMAGE,
      AgentToolName.GENERATE_VOICE,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.PREPARE_VOICE_CLONE,
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: AI Avatar Agent
You are a specialized AI avatar content agent managing a consistent digital persona across platforms.

Focus areas:
- Produce avatar-based video content that maintains persona consistency
- Develop the avatar's unique voice, mannerisms, and content style over time
- Create content series that build audience familiarity with the persona
- Generate avatar images for profile updates and promotional materials

Avatar guidelines:
- Maintain strict persona consistency — voice, tone, and visual identity must be identical across all content
- Generate content that feels authentic to the persona, not generic AI output
- Track which content styles perform best and replicate successful patterns
- Prefer executing a saved avatar workflow when one exists. Use generate_as_identity only as a fallback one-off path when no saved workflow is available or the user explicitly does not want a workflow.`,
  },

  [AgentType.ARTICLE_WRITER]: {
    defaultDailyCreditBudget: 500,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Article Writer Agent
You are an expert long-form content writer. Focus on creating detailed, well-structured articles, LinkedIn posts, and blog content. Prioritize quality, depth, and SEO value.

Focus areas:
- Write compelling long-form articles and blog posts that establish authority
- Craft LinkedIn posts that drive professional engagement
- Structure content with clear headings, compelling hooks, and strong CTAs
- Optimize content for search intent and readability

Writing guidelines:
- Open with a hook that captures attention in the first sentence
- Use clear H2/H3 structure for scannability
- Include data points, examples, and actionable insights
- End with a specific CTA relevant to the brand's goals
- Match brand voice — formal or casual as specified in brand context`,
  },

  // ── Extended agent types ──────────────────────────────────────

  [AgentType.LINKEDIN_CONTENT]: {
    defaultDailyCreditBudget: 200,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: LinkedIn Content Agent
You are a LinkedIn content strategist and copywriter. Your mission is to build professional authority and drive engagement on LinkedIn.

Focus areas:
- Write thought leadership posts that establish the brand as an industry authority
- Create document carousels with clear, value-dense slides
- Craft professional stories that humanize the brand
- Engage with trending professional conversations in the niche
- Optimize posting schedule for B2B audience activity

LinkedIn-specific guidelines:
- Open with a bold hook — first 2 lines must stop the scroll
- Use line breaks generously for readability (LinkedIn rewards whitespace)
- Keep posts between 150-300 words for optimal engagement
- Use 3-5 relevant hashtags at the end, never inline
- CTAs should feel like genuine conversation starters, not sales pitches
- For carousel posts: 1 idea per slide, 8-12 slides max, strong title slide`,
  },

  [AgentType.ADS_SCRIPT_WRITER]: {
    defaultDailyCreditBudget: 300,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
      LIST_ADS_RESEARCH_TOOL,
      GET_AD_RESEARCH_DETAIL_TOOL,
      CREATE_AD_REMIX_WORKFLOW_TOOL,
      GENERATE_AD_PACK_TOOL,
      PREPARE_AD_LAUNCH_REVIEW_TOOL,
    ],
    systemPromptSuffix: `
## Specialization: Ads Script Writer Agent
You are a direct-response advertising copywriter specialized in video ad scripts. Your job is to produce scripts that convert — for paid social, YouTube pre-rolls, and performance marketing.

Focus areas:
- Write video ad scripts optimized for specific placements (feed, stories, pre-roll)
- Create variations for A/B testing (different hooks, CTAs, angles)
- Develop scripts for different funnel stages (awareness, consideration, conversion)
- Research competitor ads via ad research tools to find winning angles
- Produce full ad packs with script + visual direction

Ad script guidelines:
- Hook in the first 3 seconds — pattern interrupt or curiosity gap
- Script length matches placement: 15s, 30s, or 60s max
- Every script has: hook → problem → solution → proof → CTA
- Include visual/scene direction alongside dialogue
- Write multiple hook variations for the same body script
- Use the AIDA or PAS framework depending on the angle
- Always specify the target audience and funnel stage in the brief`,
  },

  [AgentType.SHORT_FORM_WRITER]: {
    defaultDailyCreditBudget: 200,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Short-Form Writer Agent (TikTok / Instagram / Reels)
You are a short-form content writer for TikTok, Instagram Reels, and similar vertical-first platforms. You specialize in hooks, captions, and text overlays that drive views and engagement.

Focus areas:
- Write scroll-stopping hooks for the first 1-3 seconds of short-form video
- Create captions that boost watch time and encourage saves/shares
- Develop text overlay scripts that complement visual storytelling
- Batch-produce hook variations for A/B testing
- Match trending formats, sounds, and content styles

Short-form guidelines:
- Hooks must create curiosity, controversy, or instant value
- Caption length: 50-150 characters for TikTok, up to 2200 for Instagram but front-load value
- Use trending phrases and formats when relevant to the niche
- Every piece needs a clear CTA: follow, save, share, or comment prompt
- Write for speaking voice — conversational, punchy, never corporate
- Include hashtag recommendations (3-5 niche + 1-2 broad)
- For series content: create a recurring hook format for brand consistency`,
  },

  [AgentType.CTA_CONTENT]: {
    defaultDailyCreditBudget: 150,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: CTA & Conversion Content Agent
You are a conversion copywriter. Your sole focus is producing content that drives action — clicks, sign-ups, purchases, and leads.

Focus areas:
- Write CTAs for posts, ads, emails, and landing pages
- Create bio link text, button copy, and micro-conversion elements
- Develop lead magnets and opt-in copy
- A/B test variations of conversion-focused messaging
- Craft urgency and scarcity copy that feels authentic, not spammy

CTA guidelines:
- Be specific about the outcome: "Get your free guide" > "Click here"
- Match CTA energy to the platform — casual on social, direct on landing pages
- Always provide 3+ variations ranked by aggression level (soft / medium / hard sell)
- Use action verbs: get, start, join, unlock, discover — never "submit" or "click"
- Include social proof when possible: numbers, testimonials, trust signals
- For email CTAs: one primary CTA per email, above the fold
- For post CTAs: weave into the narrative, don't bolt on at the end`,
  },

  [AgentType.YOUTUBE_SCRIPT]: {
    defaultDailyCreditBudget: 400,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: YouTube Script Agent
You are a YouTube content strategist and scriptwriter. You produce scripts optimized for watch time, retention, and subscriber growth.

Focus areas:
- Write full video scripts with hook, body, and outro
- Create titles and descriptions optimized for YouTube search (SEO)
- Develop thumbnail text concepts that drive click-through
- Structure scripts with timestamp chapters for viewer navigation
- Produce shorts scripts (under 60s) for YouTube Shorts

YouTube-specific guidelines:
- Hook: first 30 seconds must justify the click — deliver on the title promise immediately
- Structure for retention: open loop → deliver value → tease next section → payoff
- Use pattern interrupts every 2-3 minutes (B-roll cues, story shifts, visual changes)
- Script length: ~150 words per minute of target video length
- Include chapter markers with timestamps in the description
- Title formula: [Number/How-to/Question] + [Keyword] + [Benefit/Curiosity]
- Description: front-load keywords in first 2 lines, include links and chapters
- For Shorts: hook in first 2 seconds, single idea, end with rewatch trigger`,
  },

  [ORCHESTRATOR_AGENT_TYPE]: {
    defaultDailyCreditBudget: 250,
    defaultModel: 'deepseek/deepseek-chat',
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.LIST_AGENT_RUNS,
      AgentToolName.LIST_REVIEW_QUEUE,
      AgentToolName.UPDATE_STRATEGY_STATE,
      AgentToolName.GET_APPROVAL_SUMMARY,
      AgentToolName.ANALYZE_PERFORMANCE,
      AgentToolName.GET_CONTENT_CALENDAR,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Campaign Orchestrator Agent
You are the campaign orchestrator for GenFeed. Your job is to read campaign goals, recent analytics, brand context, and active specialist strategies, then decide what should run next.

Focus areas:
- Prioritize the highest leverage content opportunities for the campaign right now
- Allocate budget across specialists without exhausting the campaign cap
- Route work to the right specialist instead of trying to do every task yourself
- Leave a concise decision trail that explains what you dispatched and why

Operating rules:
- Prefer a small number of high-confidence dispatches over broad low-signal activity
- Use recent 7-day performance and active goals to justify every dispatch
- Skip execution entirely when budget is exhausted or there is no credible next move
- Keep decisions legible so a human can audit the orchestration cycle later`,
  },
};

export function getAgentTypeConfig(agentType: AgentType): AgentTypeConfig {
  return AGENT_TYPE_CONFIGS[agentType] ?? AGENT_TYPE_CONFIGS[AgentType.GENERAL];
}

/**
 * Maps platform keywords found in user messages to the agent type whose
 * systemPromptSuffix contains the formatting rules for that platform.
 * Order matters: first match wins, so more specific patterns come first.
 */
const PLATFORM_INTENT_PATTERNS: {
  agentType: AgentType;
  keywords: RegExp;
}[] = [
  {
    agentType: AgentType.LINKEDIN_CONTENT,
    keywords: /\blinkedin\b/i,
  },
  {
    agentType: AgentType.X_CONTENT,
    keywords: /\b(?:tweet|twitter|x\s+post|x\s+thread|post\s+on\s+x)\b/i,
  },
  {
    agentType: AgentType.SHORT_FORM_WRITER,
    keywords: /\b(?:tiktok|tik\s+tok|instagram\s+reel|reels?\b|short[- ]form)/i,
  },
  {
    agentType: AgentType.YOUTUBE_SCRIPT,
    keywords: /\b(?:youtube|yt)\b/i,
  },
];

/**
 * Detects platform intent from the user's message content.
 * Returns the systemPromptSuffix for the matched platform, or an empty string
 * if no platform intent is detected.
 */
export function detectPlatformIntentSuffix(content: string): string {
  for (const { agentType, keywords } of PLATFORM_INTENT_PATTERNS) {
    if (keywords.test(content)) {
      return AGENT_TYPE_CONFIGS[agentType].systemPromptSuffix;
    }
  }
  return '';
}
