import type { AgentToolDefinition } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { getToolsForSurface, toAgentTools } from '@genfeedai/tools';

const CREATE_LIVESTREAM_BOT_TOOL = 'create_livestream_bot' as AgentToolName;
const MANAGE_LIVESTREAM_BOT_TOOL = 'manage_livestream_bot' as AgentToolName;
const LIST_ADS_RESEARCH_TOOL = 'list_ads_research' as AgentToolName;
const GET_AD_RESEARCH_DETAIL_TOOL = 'get_ad_research_detail' as AgentToolName;
const CREATE_AD_REMIX_WORKFLOW_TOOL =
  'create_ad_remix_workflow' as AgentToolName;
const GENERATE_AD_PACK_TOOL = 'generate_ad_pack' as AgentToolName;
const PREPARE_AD_LAUNCH_REVIEW_TOOL =
  'prepare_ad_launch_review' as AgentToolName;
const DRAFT_BRAND_VOICE_PROFILE_TOOL =
  'draft_brand_voice_profile' as AgentToolName;
const SAVE_BRAND_VOICE_PROFILE_TOOL =
  'save_brand_voice_profile' as AgentToolName;
const GET_WORKFLOW_INPUTS_TOOL = 'get_workflow_inputs' as AgentToolName;

const BASE_AGENT_TOOLS: AgentToolDefinition[] = toAgentTools(
  getToolsForSurface('agent'),
) as AgentToolDefinition[];

const CLOUD_AGENT_TOOL_EXTENSIONS: AgentToolDefinition[] = [
  {
    creditCost: 0,
    description:
      'Create a post draft from text, or prepare and confirm direct publishing for an existing content item/ingredient by returning a publish confirmation card first.',
    name: AgentToolName.CREATE_POST,
    parameters: {
      properties: {
        caption: {
          description:
            'Optional caption override to publish with the selected content item.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms the publish card.',
          type: 'boolean',
        },
        content: {
          description:
            'Draft post text content when creating a standalone draft post.',
          type: 'string',
        },
        contentId: {
          description:
            'Existing content or ingredient ID to publish directly from chat.',
          type: 'string',
        },
        ingredientId: {
          description: 'Existing ingredient ID to publish directly from chat.',
          type: 'string',
        },
        mediaUrls: {
          description:
            'Optional media URLs to attach when creating a standalone draft post.',
          items: { type: 'string' },
          type: 'array',
        },
        platform: {
          description:
            'Legacy single-platform hint when creating a standalone draft post.',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
        platforms: {
          description:
            'Platforms to publish the selected content item to after confirmation.',
          items: {
            enum: [
              'instagram',
              'twitter',
              'linkedin',
              'tiktok',
              'youtube',
              'facebook',
            ],
            type: 'string',
          },
          type: 'array',
        },
        scheduledAt: {
          description:
            'Optional ISO datetime for scheduling the direct publish instead of publishing immediately.',
          type: 'string',
        },
        textContent: {
          description:
            'Optional text content or caption to reuse for the publish confirmation card.',
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Draft a structured brand voice profile for a brand using website/social context, audience, positioning, and examples the user likes or dislikes.',
    name: DRAFT_BRAND_VOICE_PROFILE_TOOL,
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional target brand ID. Uses the active brand if omitted.',
          type: 'string',
        },
        examplesToAvoid: {
          description:
            'Examples, tones, or creators the brand does not want to sound like.',
          items: { type: 'string' },
          type: 'array',
        },
        examplesToEmulate: {
          description:
            'Examples, tones, or creators the brand wants to emulate.',
          items: { type: 'string' },
          type: 'array',
        },
        offering: {
          description: 'What the brand sells, creates, or helps with.',
          type: 'string',
        },
        targetAudience: {
          description: 'Who the brand is trying to reach.',
          type: 'string',
        },
        url: {
          description: 'Website, LinkedIn company page, or X profile URL.',
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Save an approved structured brand voice profile to the selected brand agent config.',
    name: SAVE_BRAND_VOICE_PROFILE_TOOL,
    parameters: {
      properties: {
        brandId: {
          description: 'Target brand ID. Uses the active brand if omitted.',
          type: 'string',
        },
        voiceProfile: {
          description: 'Approved brand voice profile to save.',
          type: 'object',
        },
      },
      required: ['voiceProfile'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get organization analytics, a post analytics snapshot, or analytics for the latest published post related to a selected content item.',
    name: AgentToolName.GET_ANALYTICS,
    parameters: {
      properties: {
        contentId: {
          description:
            'Existing content or ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        ingredientId: {
          description:
            'Existing ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        metric: {
          description:
            'Specific metric to retrieve for organization summaries.',
          enum: ['engagement', 'reach', 'followers', 'impressions', 'clicks'],
          type: 'string',
        },
        period: {
          description: 'Time period for organization analytics summaries.',
          enum: ['7d', '30d', '90d'],
          type: 'string',
        },
        postId: {
          description: 'Existing post ID to fetch a direct analytics snapshot.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Save content, examples, preferences, or winners into agent memory and optionally route them to brand knowledge.',
    name: 'capture_memory' as AgentToolName,
    parameters: {
      properties: {
        brandId: {
          description: 'Optional brand ID for brand-scoped saves',
          type: 'string',
        },
        confidence: {
          description:
            'How confident the system should be in reusing this memory (0-1)',
          type: 'number',
        },
        content: {
          description: 'The content or instruction to save',
          type: 'string',
        },
        contentType: {
          description: 'What kind of content this memory applies to',
          enum: ['newsletter', 'tweet', 'thread', 'article', 'post', 'generic'],
          type: 'string',
        },
        importance: {
          description: 'Importance weight for retrieval (0-1)',
          type: 'number',
        },
        kind: {
          description: 'How this memory should be interpreted',
          enum: [
            'preference',
            'positive_example',
            'negative_example',
            'winner',
            'reference',
            'instruction',
            'pattern',
          ],
          type: 'string',
        },
        performanceSnapshot: {
          description:
            'Optional performance data associated with the saved content',
          type: 'object',
        },
        platform: {
          description:
            'Optional platform label such as twitter, beehiiv, or linkedin',
          type: 'string',
        },
        saveToContextMemory: {
          description:
            'Whether to also save this content to the brand context memory layer',
          type: 'boolean',
        },
        scope: {
          description: 'Whether the save is personal or brand-scoped',
          enum: ['user', 'brand'],
          type: 'string',
        },
        sourceContentId: {
          description: 'Optional ID of the related content item',
          type: 'string',
        },
        sourceMessageId: {
          description: 'Optional thread message ID this came from',
          type: 'string',
        },
        sourceType: {
          description: 'Where this memory came from',
          type: 'string',
        },
        sourceUrl: {
          description: 'Optional URL for the source material',
          type: 'string',
        },
        summary: {
          description: 'Short reusable summary of the saved content',
          type: 'string',
        },
        tags: {
          description: 'Optional retrieval tags',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['content'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Resolve the best official workflow source for the request, ask for confirmation, then install it into the current organization. Prefer seeded templates first, official marketplace workflows second, and only generate a new workflow as fallback.',
    name: 'install_official_workflow' as AgentToolName,
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional brand ID to attach to the installed workflow after bootstrap.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms installation or generation.',
          type: 'boolean',
        },
        contentType: {
          description:
            'Optional content type hint for resolving the right workflow.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        label: {
          description: 'Optional workflow label for the installed copy.',
          type: 'string',
        },
        platform: {
          description:
            'Optional platform hint such as linkedin, instagram, or tiktok.',
          type: 'string',
        },
        prompt: {
          description:
            'What the workflow should accomplish so the resolver can match the best official source.',
          type: 'string',
        },
        schedule: {
          description:
            'Optional cron expression to apply to the installed workflow.',
          type: 'string',
        },
        sourceDescription: {
          description:
            'Resolved source description from a prior confirmation step.',
          type: 'string',
        },
        sourceId: {
          description: 'Resolved source ID from a prior confirmation step.',
          type: 'string',
        },
        sourceName: {
          description: 'Resolved source name from a prior confirmation step.',
          type: 'string',
        },
        sourceSlug: {
          description:
            'Resolved marketplace slug from a prior confirmation step.',
          type: 'string',
        },
        sourceType: {
          description: 'Resolved source type from a prior confirmation step.',
          enum: ['seeded-template', 'marketplace-listing', 'generated'],
          type: 'string',
        },
        timezone: {
          description: 'Optional timezone for the workflow schedule.',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a workflow for the current organization and brand. Supports direct graph persistence, recurring automation scaffolds, and natural-language workflow generation so the result can be edited in the Workflows app.',
    name: AgentToolName.CREATE_WORKFLOW,
    parameters: {
      properties: {
        aspectRatio: {
          description:
            'Optional visual aspect ratio for generated recurring assets.',
          enum: ['1:1', '4:5', '9:16', '16:9'],
          type: 'string',
        },
        brandId: {
          description:
            'Optional explicit brand ID to attach to the workflow; otherwise uses the current selected brand when available.',
          type: 'string',
        },
        contentType: {
          description:
            'Optional recurring content type when scaffolding a workflow from a brief.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        count: {
          description:
            'Optional number of assets to generate per scheduled run for recurring workflows.',
          type: 'number',
        },
        description: {
          description:
            'Optional natural-language description of the workflow to generate or save.',
          type: 'string',
        },
        diversityMode: {
          description:
            'Optional variation level for recurring generated assets in the same run.',
          enum: ['low', 'medium', 'high'],
          type: 'string',
        },
        edges: {
          description: 'Optional workflow graph edges',
          items: { type: 'object' },
          type: 'array',
        },
        inputVariables: {
          description: 'Optional workflow input variable definitions',
          items: { type: 'object' },
          type: 'array',
        },
        isScheduleEnabled: {
          description: 'Whether the workflow schedule should be enabled',
          type: 'boolean',
        },
        label: {
          description: 'Workflow label shown in the Workflows app',
          type: 'string',
        },
        metadata: {
          description: 'Optional workflow metadata',
          type: 'object',
        },
        model: {
          description:
            'Optional generation model override for recurring flows.',
          type: 'string',
        },
        negativePrompt: {
          description:
            'Optional constraints for what recurring generations should avoid.',
          type: 'string',
        },
        nodes: {
          description: 'Optional workflow graph nodes',
          items: { type: 'object' },
          type: 'array',
        },
        prompt: {
          description:
            'Optional recurring generation brief. When paired with schedule, this scaffolds a recurring workflow.',
          type: 'string',
        },
        schedule: {
          description: 'Optional cron expression for workflow recurrence',
          type: 'string',
        },
        sourceAssetId: {
          description:
            'Optional source asset ID to attach to a recurring workflow brief.',
          type: 'string',
        },
        steps: {
          description: 'Optional legacy step definitions',
          items: { type: 'object' },
          type: 'array',
        },
        styleNotes: {
          description:
            'Optional creative direction or brand guardrails for recurring workflows.',
          type: 'string',
        },
        targetPlatforms: {
          description:
            'Optional platform hints used during natural-language workflow generation.',
          items: { type: 'string' },
          type: 'array',
        },
        templateId: {
          description: 'Optional workflow template ID',
          type: 'string',
        },
        timezone: {
          description: 'Optional timezone for the schedule',
          type: 'string',
        },
        trigger: {
          description: 'Optional trigger mode for the workflow',
          type: 'string',
        },
      },
      required: ['label'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a YouTube or Twitch livestream chat bot for the current organization and brand, then return a bot card with links and basic control actions.',
    name: CREATE_LIVESTREAM_BOT_TOOL,
    parameters: {
      properties: {
        botChannelLabel: {
          description:
            'Optional human-readable label for the YouTube or Twitch channel.',
          type: 'string',
        },
        botChannelUrl: {
          description:
            'Optional URL for the YouTube or Twitch channel/profile.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional explicit brand ID to attach to the bot; otherwise uses the current selected brand when available.',
          type: 'string',
        },
        channelId: {
          description:
            'Required platform target identifier for the livestream channel/account.',
          type: 'string',
        },
        contextTemplate: {
          description:
            'Optional context-aware question template for automatic chat prompts.',
          type: 'string',
        },
        credentialId: {
          description:
            'Optional credential ID used to post to the livestream target.',
          type: 'string',
        },
        description: {
          description: 'Optional bot description.',
          type: 'string',
        },
        hostPromptTemplate: {
          description:
            'Optional host prompt template for scheduled automatic posts.',
          type: 'string',
        },
        label: {
          description: 'Bot label shown in the bots area.',
          type: 'string',
        },
        linkLabel: {
          description: 'Optional label for the primary chat link drop.',
          type: 'string',
        },
        linkUrl: {
          description: 'Optional URL used for scheduled link drops.',
          type: 'string',
        },
        liveChatId: {
          description: 'Optional YouTube Live chat identifier when available.',
          type: 'string',
        },
        maxAutoPostsPerHour: {
          description:
            'Optional maximum number of automatic posts per hour per platform.',
          type: 'number',
        },
        minimumMessageGapSeconds: {
          description:
            'Optional minimum number of seconds between automatic posts.',
          type: 'number',
        },
        platform: {
          description: 'Livestream platform for the bot.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        scheduledCadenceMinutes: {
          description:
            'Optional number of minutes between scheduled automatic posts.',
          type: 'number',
        },
        senderId: {
          description: 'Optional Twitch sender ID used for message delivery.',
          type: 'string',
        },
        transcriptEnabled: {
          description: 'Optional flag controlling transcript-assisted context.',
          type: 'boolean',
        },
      },
      required: ['channelId', 'label', 'platform'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Manage an existing YouTube or Twitch livestream chat bot session by starting, pausing, resuming, stopping, setting a manual override, or sending a message immediately.',
    name: MANAGE_LIVESTREAM_BOT_TOOL,
    parameters: {
      properties: {
        action: {
          description: 'The livestream bot action to perform.',
          enum: [
            'start_session',
            'pause_session',
            'resume_session',
            'stop_session',
            'set_override',
            'send_now',
          ],
          type: 'string',
        },
        activeLinkId: {
          description: 'Optional active link ID for a manual override.',
          type: 'string',
        },
        botId: {
          description: 'Existing bot ID to manage.',
          type: 'string',
        },
        message: {
          description:
            'Optional explicit message for send_now. If omitted, the bot will generate one.',
          type: 'string',
        },
        platform: {
          description: 'Platform to target for send_now actions.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        promotionAngle: {
          description: 'Optional promotion angle for manual override context.',
          type: 'string',
        },
        topic: {
          description: 'Optional topic for manual override context.',
          type: 'string',
        },
        type: {
          description:
            'Optional message type for send_now when the message should be generated automatically.',
          enum: [
            'scheduled_link_drop',
            'scheduled_host_prompt',
            'context_aware_question',
          ],
          type: 'string',
        },
      },
      required: ['action', 'botId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'List the highest-performing public and connected ads for the current brand niche, platform, source, metric, and timeframe filters.',
    name: LIST_ADS_RESEARCH_TOOL,
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Optional connected ad account ID for my-account lookups.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description:
            'Optional Google inventory filter. Meta always uses all placements.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Optional connected credential ID for my-account lookups.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        limit: {
          description: 'Optional maximum number of ads to inspect.',
          type: 'number',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        metric: {
          description: 'Optional ranking metric.',
          enum: [
            'performanceScore',
            'ctr',
            'roas',
            'conversions',
            'spendEfficiency',
          ],
          type: 'string',
        },
        platform: {
          description: 'Optional ads platform filter.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description:
            'Whether to search public niche winners, connected accounts, or both.',
          enum: ['public', 'my_accounts', 'all'],
          type: 'string',
        },
        timeframe: {
          description: 'Optional timeframe filter.',
          enum: ['last_7_days', 'last_30_days', 'last_90_days', 'all_time'],
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Inspect one ad from the ads research hub and return the creative, metrics, and pattern explanation.',
    name: GET_AD_RESEARCH_DETAIL_TOOL,
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when inspecting a my-account ad.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by list_ads_research.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when inspecting a my-account ad.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description: 'Where the ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create an official ad remix workflow from a selected ad. The workflow stays in review and does not auto-publish.',
    name: CREATE_AD_REMIX_WORKFLOW_TOOL,
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Generate a brand-specific ad pack from a selected ad without creating a launch or publish action.',
    name: GENERATE_AD_PACK_TOOL,
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a paused Meta or Google campaign launch draft for review from a selected ad. This never publishes live.',
    name: PREPARE_AD_LAUNCH_REVIEW_TOOL,
    parameters: {
      properties: {
        adAccountId: {
          description:
            'Connected ad account ID when the source ad comes from my accounts.',
          type: 'string',
        },
        adId: {
          description: 'The ad identifier returned by ads research.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional brand ID. If omitted, the selected brand is used when available.',
          type: 'string',
        },
        campaignName: {
          description: 'Optional campaign name override.',
          type: 'string',
        },
        channel: {
          description: 'Optional Google inventory filter.',
          enum: ['all', 'search', 'display', 'youtube'],
          type: 'string',
        },
        createWorkflow: {
          description:
            'Whether to also create a reusable remix workflow as part of launch prep.',
          type: 'boolean',
        },
        credentialId: {
          description:
            'Connected credential ID when the source ad comes from my accounts.',
          type: 'string',
        },
        dailyBudget: {
          description:
            'Optional paused daily budget for the prepared campaign.',
          type: 'number',
        },
        industry: {
          description: 'Optional niche or industry override.',
          type: 'string',
        },
        loginCustomerId: {
          description:
            'Optional Google manager login customer ID for account-scoped lookups.',
          type: 'string',
        },
        objective: {
          description:
            'Optional campaign objective override such as Conversions or Leads.',
          type: 'string',
        },
        platform: {
          description: 'Optional platform hint for connected ads.',
          enum: ['meta', 'google'],
          type: 'string',
        },
        source: {
          description: 'Where the source ad came from.',
          enum: ['public', 'my_accounts'],
          type: 'string',
        },
      },
      required: ['adId', 'source'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Rate content quality from 1-10 and return actionable feedback and improvement suggestions.',
    name: 'rate_content' as AgentToolName,
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content item to rate',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to rate',
          enum: ['image', 'video', 'post'],
          type: 'string',
        },
        context: {
          description:
            'Optional context for scoring criteria, campaign goals, or audience',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Add or remove a boolean vote on an ingredient (single vote toggle per user).',
    name: 'rate_ingredient' as AgentToolName,
    parameters: {
      properties: {
        ingredientId: {
          description: 'Ingredient ID to vote/unvote',
          type: 'string',
        },
      },
      required: ['ingredientId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get the most-voted ingredients for this organization (optionally filtered by brand/category).',
    name: 'get_top_ingredients' as AgentToolName,
    parameters: {
      properties: {
        brandId: {
          description: 'Optional brand ID filter',
          type: 'string',
        },
        category: {
          description: 'Optional ingredient category filter',
          enum: ['image', 'video', 'music', 'avatar', 'gif'],
          type: 'string',
        },
        limit: {
          description: 'Maximum number of ingredients to return (default 10)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a replication plan for a top ingredient and return source metadata + next actions.',
    name: 'replicate_top_ingredient' as AgentToolName,
    parameters: {
      properties: {
        ingredientId: {
          description: 'Source ingredient ID to replicate',
          type: 'string',
        },
        variations: {
          description: 'How many variations to create (default 3)',
          type: 'number',
        },
      },
      required: ['ingredientId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a measurable agent goal for the current organization or brand using one analytics metric.',
    name: 'create_goal' as AgentToolName,
    parameters: {
      properties: {
        brandId: { type: 'string' },
        description: { type: 'string' },
        endDate: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['label', 'metric', 'targetValue'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Check progress for an existing agent goal using current analytics data.',
    name: 'check_goal_progress' as AgentToolName,
    parameters: {
      properties: {
        goalId: { type: 'string' },
      },
      required: ['goalId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Update an existing agent goal to change its target, dates, description, or active state.',
    name: 'update_goal' as AgentToolName,
    parameters: {
      properties: {
        description: { type: 'string' },
        endDate: { type: 'string' },
        goalId: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['goalId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get the input variable definitions for a workflow. Use this before execute_workflow to discover what inputs a workflow expects.',
    name: GET_WORKFLOW_INPUTS_TOOL,
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to inspect',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
  },
];

function mergeAgentTools(
  baseTools: AgentToolDefinition[],
  extensions: AgentToolDefinition[],
): AgentToolDefinition[] {
  const merged = new Map<string, AgentToolDefinition>(
    baseTools.map((tool) => [String(tool.name), tool]),
  );

  for (const tool of extensions) {
    merged.set(String(tool.name), tool);
  }

  return [...merged.values()];
}

export const AGENT_TOOLS: AgentToolDefinition[] = mergeAgentTools(
  BASE_AGENT_TOOLS,
  CLOUD_AGENT_TOOL_EXTENSIONS,
);

export function getToolDefinitions(): AgentToolDefinition[] {
  return AGENT_TOOLS;
}

export function getToolDefinitionByName(
  name: string,
): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => String(tool.name) === name);
}
