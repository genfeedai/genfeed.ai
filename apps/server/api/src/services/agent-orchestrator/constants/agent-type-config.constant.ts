import { ORCHESTRATOR_AGENT_TYPE } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentType } from '@genfeedai/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { AgentToolName } from '@genfeedai/contracts/interfaces';

export interface AgentTypeConfig {
  defaultDailyCreditBudget: number;
  defaultModel: string;
  defaultTools: AgentToolName[];
  systemPromptSuffix: string;
}

/**
 * Per-type defaults, named by the job rather than the vendor so a catalogue
 * change is one edit here instead of a dozen literals. Both keys come from
 * `@genfeedai/contracts/constants`, which is also what the biller prices against.
 *
 * Volume types run high-frequency, low-stakes turns; creative types write
 * copy and direct generation, where the better model pays for itself.
 */
const VOLUME_AGENT_MODEL = LLM_DEFAULTS.volumeAgent;
const CREATIVE_AGENT_MODEL = LLM_DEFAULTS.creativeAgent;

/**
 * Workflow tools every content specialist needs so chat can list inputs,
 * fill slots, and run the same deterministic graphs as Team → Run Workflow.
 */
const WORKFLOW_RUN_TOOLS: AgentToolName[] = [
  AgentToolName.LIST_WORKFLOWS,
  AgentToolName.INSPECT_WORKFLOW,
  AgentToolName.GET_WORKFLOW_INPUTS,
  AgentToolName.EXECUTE_WORKFLOW,
  AgentToolName.PREPARE_WORKFLOW_TRIGGER,
  AgentToolName.LIST_SYSTEM_WORKFLOW_CATALOG,
  AgentToolName.INSTALL_SYSTEM_WORKFLOW,
];

const SHARED_READ_TOOLS: AgentToolName[] = [
  AgentToolName.GET_ANALYTICS,
  AgentToolName.GET_CREDITS_BALANCE,
  AgentToolName.GET_DASHBOARD_LAYOUT,
  AgentToolName.GET_TRENDS,
  AgentToolName.LIST_BRANDS,
  AgentToolName.LIST_CHARACTERS,
  AgentToolName.LIST_POSTS,
  AgentToolName.LIST_REVIEW_QUEUE,
  AgentToolName.GET_CONNECTION_STATUS,
  AgentToolName.UPDATE_STRATEGY_STATE,
  AgentToolName.GET_APPROVAL_SUMMARY,
  AgentToolName.ANALYZE_PERFORMANCE,
  AgentToolName.GET_CONTENT_CALENDAR,
  AgentToolName.LIST_GENFEED_TOOLS,
  AgentToolName.CAPTURE_MEMORY,
  AgentToolName.CREATE_WORKFLOW,
  ...WORKFLOW_RUN_TOOLS,
  AgentToolName.CREATE_LIVESTREAM_BOT,
  AgentToolName.MANAGE_LIVESTREAM_BOT,
  AgentToolName.LIST_ADS_RESEARCH,
  AgentToolName.GET_AD_RESEARCH_DETAIL,
  AgentToolName.CREATE_AD_REMIX_WORKFLOW,
  AgentToolName.LIST_INSTAGRAM_INSPIRATION,
  AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL,
  AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW,
  AgentToolName.GENERATE_AD_PACK,
  AgentToolName.PREPARE_AD_LAUNCH_REVIEW,
  AgentToolName.RATE_CONTENT,
  AgentToolName.SCORE_SEO,
  AgentToolName.RATE_INGREDIENT,
  AgentToolName.GET_TOP_INGREDIENTS,
  AgentToolName.REPLICATE_TOP_INGREDIENT,
  AgentToolName.SUGGEST_NEXT_STEPS,
];

/**
 * Image/video card plus the voice generate/clone card. Content specialists
 * need both so an empty org voice library still docks a catalog-backed card.
 */
const PREPARE_MEDIA_TOOLS: AgentToolName[] = [
  AgentToolName.PREPARE_GENERATION,
  AgentToolName.PREPARE_VOICE_CLONE,
];

const WORKFLOW_FIRST_PROMPT = `
## Workflow-first content creation
Prefer deterministic workflows over one-off generation when the user wants production content:
1. list_workflows or list_system_workflow_catalog to find a matching graph
2. get_workflow_inputs to discover required slots (topic, prompt, assets)
3. Fill only the variable slots — never rewrite the workflow graph
4. execute_workflow with complete inputs
Use prepare_workflow_trigger when the user should confirm slots in the UI first.
`;

export const AGENT_TYPE_CONFIGS: Record<AgentType, AgentTypeConfig> = {
  [AgentType.GENERAL]: {
    defaultDailyCreditBudget: 100,
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...Object.values(AgentToolName),
      AgentToolName.CAPTURE_MEMORY,
      AgentToolName.LIST_ADS_RESEARCH,
      AgentToolName.GET_AD_RESEARCH_DETAIL,
      AgentToolName.CREATE_AD_REMIX_WORKFLOW,
      AgentToolName.GENERATE_AD_PACK,
      AgentToolName.PREPARE_AD_LAUNCH_REVIEW,
      AgentToolName.RATE_CONTENT,
      AgentToolName.RATE_INGREDIENT,
      AgentToolName.GET_TOP_INGREDIENTS,
      AgentToolName.REPLICATE_TOP_INGREDIENT,
    ],
    systemPromptSuffix: '',
  },

  [AgentType.X_CONTENT]: {
    defaultDailyCreditBudget: 100,
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.RESOLVE_HANDLE,
      AgentToolName.DISCOVER_ENGAGEMENTS,
      AgentToolName.DRAFT_ENGAGEMENT_REPLY,
      AgentToolName.SEARCH_X_POSTS,
      AgentToolName.FETCH_X_POST,
      AgentToolName.LIST_X_ACCOUNT_ACTIVITY,
      AgentToolName.DRAFT_X_QUOTE,
      AgentToolName.DRAFT_X_REPOST,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: X/Twitter Content Agent
You are a specialized X/Twitter content agent. Your primary mission is to grow the brand's presence on X through consistent, high-quality content and strategic engagement.
${WORKFLOW_FIRST_PROMPT}
Default graph: founder-x-post (topic, angle, optional proof/CTA).

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
    defaultModel: CREATIVE_AGENT_MODEL,
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
${WORKFLOW_FIRST_PROMPT}
Default graph: founder-editorial-illustration (visualAngle, visualStyle, brand cues).

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
    defaultModel: CREATIVE_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_VIDEO,
      AgentToolName.GENERATE_IMAGE,
      AgentToolName.GENERATE_VOICE,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.PREPARE_VOICE_CLONE,
      AgentToolName.PREPARE_WORKFLOW_TRIGGER,
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Video Creator Agent
You are a specialized short-form video content agent for platforms like TikTok, Instagram Reels, and YouTube Shorts.
${WORKFLOW_FIRST_PROMPT}
Default graph: social-media-video-series.

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
    defaultModel: CREATIVE_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_AS_IDENTITY,
      AgentToolName.GENERATE_VIDEO,
      AgentToolName.GENERATE_IMAGE,
      AgentToolName.GENERATE_VOICE,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.PREPARE_GENERATION,
      AgentToolName.PREPARE_VOICE_CLONE,
      AgentToolName.PREPARE_CLIP_WORKFLOW_RUN,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: AI Avatar Agent
You are a specialized AI avatar content agent managing a consistent digital persona across platforms.
${WORKFLOW_FIRST_PROMPT}
Default graph: avatar-ugc-heygen (script required; photo/audio optional).

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
    defaultModel: CREATIVE_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.AI_ACTION,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Article Writer Agent
You are an expert long-form content writer. Focus on creating detailed, well-structured articles, LinkedIn posts, and blog content. Prioritize quality, depth, and SEO value.
${WORKFLOW_FIRST_PROMPT}
Default graph: founder-newsletter (topic, coreTakeaway).

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
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: LinkedIn Content Agent
You are a LinkedIn content strategist and copywriter. Your mission is to build professional authority and drive engagement on LinkedIn.
${WORKFLOW_FIRST_PROMPT}
Default graph: founder-newsletter.

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
    defaultModel: CREATIVE_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
      AgentToolName.LIST_ADS_RESEARCH,
      AgentToolName.GET_AD_RESEARCH_DETAIL,
      AgentToolName.CREATE_AD_REMIX_WORKFLOW,
      AgentToolName.GENERATE_AD_PACK,
      AgentToolName.PREPARE_AD_LAUNCH_REVIEW,
    ],
    systemPromptSuffix: `
## Specialization: Ads Script Writer Agent
You are a direct-response advertising copywriter specialized in video ad scripts. Your job is to produce scripts that convert — for paid social, YouTube pre-rolls, and performance marketing.
${WORKFLOW_FIRST_PROMPT}

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
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: Short-Form Writer Agent (TikTok / Instagram / Reels)
You are a short-form content writer for TikTok, Instagram Reels, and similar vertical-first platforms. You specialize in hooks, captions, and text overlays that drive views and engagement.
${WORKFLOW_FIRST_PROMPT}
Default graph: tiktok-slideshow-automation.

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
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: CTA & Conversion Content Agent
You are a conversion copywriter. Your sole focus is producing content that drives action — clicks, sign-ups, purchases, and leads.
${WORKFLOW_FIRST_PROMPT}

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
    defaultModel: CREATIVE_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
      AgentToolName.GENERATE_CONTENT,
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.CREATE_POST,
      AgentToolName.SCHEDULE_POST,
      AgentToolName.REPURPOSE_POST,
      AgentToolName.AI_ACTION,
      ...PREPARE_MEDIA_TOOLS,
      AgentToolName.CREATE_WORKFLOW,
    ],
    systemPromptSuffix: `
## Specialization: YouTube Script Agent
You are a YouTube content strategist and scriptwriter. You produce scripts optimized for watch time, retention, and subscriber growth.
${WORKFLOW_FIRST_PROMPT}
Default graph: youtube-thumbnail-script (titleText, thumbnailConcept, optional reference image).

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

  [AgentType.BRAND_INTERVIEW]: {
    defaultDailyCreditBudget: 50,
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      AgentToolName.GET_CURRENT_BRAND,
      AgentToolName.START_BRAND_INTERVIEW,
      AgentToolName.SUBMIT_BRAND_INTERVIEW_ANSWER,
      AgentToolName.SKIP_BRAND_INTERVIEW_QUESTION,
      AgentToolName.GET_BRAND_COMPLETENESS,
    ],
    systemPromptSuffix: '',
  },

  [ORCHESTRATOR_AGENT_TYPE]: {
    defaultDailyCreditBudget: 250,
    defaultModel: VOLUME_AGENT_MODEL,
    defaultTools: [
      ...SHARED_READ_TOOLS,
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
 * Fixed suffix table for `detectPlatformIntentSuffix`.
 * User message text only selects among these four compile-time suffixes.
 * Matched content is never interpolated into the system prompt.
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
 * Intentional gated selector: user message text only indexes
 * `PLATFORM_INTENT_PATTERNS` and returns a fixed `systemPromptSuffix`.
 * Free text is never interpolated into the system prompt — a jailbreak
 * string that happens to mention LinkedIn still yields only the LinkedIn
 * suffix. This is not user-controlled prompt injection.
 */
export function detectPlatformIntentSuffix(content: string): string {
  for (const { agentType, keywords } of PLATFORM_INTENT_PATTERNS) {
    if (keywords.test(content)) {
      return AGENT_TYPE_CONFIGS[agentType].systemPromptSuffix;
    }
  }
  return '';
}
