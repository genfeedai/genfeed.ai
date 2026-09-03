import type {
  ActionCreditPolicy,
  ActionWorkflowCategory,
  CreateGenfeedActionNodeInput,
  GenfeedActionDefinition,
  GenfeedActionNodeDefinition,
} from '../interfaces/action-definition.interface';
import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { getExplicitActionContract } from './contracts/explicit-action-contracts';
import {
  closeObjectSchemas,
  materializeJsonDocumentSchema,
} from './contracts/schema-builders';
import { TOOL_ACTION_OUTPUT_SCHEMA } from './contracts/tool-action-contract';
import { ALL_TOOLS } from './tool-registry';

// Every tool action shares one materialized envelope: the recursive JSON
// document marker has to become a real `$defs` reference before the engine
// compiles the contract, and one shared instance keeps that compile cached.
const MATERIALIZED_TOOL_ACTION_OUTPUT_SCHEMA = materializeJsonDocumentSchema(
  TOOL_ACTION_OUTPUT_SCHEMA,
);

const PROVIDER_CALLBACK_ACTION_IDS = new Set([
  'aiAvatarVideo',
  'imageGen',
  'lipSync',
  'reframe',
  'upscale',
  'videoGen',
  'workspace.task.facecam.generate',
]);

function internalAction(
  id: string,
  label: string,
  description: string,
  options: Partial<
    Pick<
      GenfeedActionDefinition,
      | 'authorization'
      | 'credits'
      | 'idempotency'
      | 'visibility'
      | 'workflowCategory'
      | 'workflowIcon'
    >
  > = {},
): GenfeedActionDefinition {
  const contract = getExplicitActionContract(id);
  return {
    approval: 'none',
    authorization: options.authorization ?? 'system',
    completionMode: PROVIDER_CALLBACK_ACTION_IDS.has(id)
      ? 'provider-callback'
      : 'synchronous',
    credits: options.credits ?? { amount: 0, mode: 'fixed' },
    description,
    id,
    idempotency: options.idempotency ?? 'run-node',
    inputSchema: contract.inputSchema,
    label,
    outputSchema: contract.outputSchema,
    visibility: options.visibility ?? 'internal',
    workflowCategory: options.workflowCategory,
    workflowIcon: options.workflowIcon,
  };
}

function toolAction(tool: CanonicalToolDefinition): GenfeedActionDefinition {
  return {
    approval: tool.mutationPolicy === 'approval-required' ? 'required' : 'none',
    authorization: tool.requiredRole,
    completionMode: 'synchronous',
    credits: { amount: tool.creditCost, mode: 'fixed' },
    description: tool.description,
    id: tool.name,
    idempotency: 'run-node',
    inputSchema: materializeJsonDocumentSchema(
      closeObjectSchemas(tool.parameters),
    ),
    label: tool.name
      .split('_')
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' '),
    outputSchema: MATERIALIZED_TOOL_ACTION_OUTPUT_SCHEMA,
    visibility: 'tool',
  };
}

type WorkflowActionCatalogEntry = readonly [
  id: string,
  label: string,
  description: string,
  category: ActionWorkflowCategory,
  icon: string,
];

const WORKFLOW_ACTIONS = [
  [
    'ai-enhance',
    'Enhance Media',
    'Enhances media quality with AI.',
    'processing',
    'WandSparkles',
  ],
  [
    'ai-transcribe',
    'Transcribe Media',
    'Transcribes workflow audio or video.',
    'ai',
    'FileText',
  ],
  [
    'aiAvatarVideo',
    'Generate Avatar Video',
    'Generates one avatar video.',
    'ai',
    'Video',
  ],
  [
    'analyticsFeedback',
    'Read Analytics Feedback',
    'Reads performance analytics for workflow context.',
    'input',
    'Eye',
  ],
  [
    'attachPostIngredient',
    'Attach Post Ingredient',
    'Attaches a generated ingredient to a post draft.',
    'composition',
    'Puzzle',
  ],
  [
    'brand',
    'Read Brand',
    'Reads one tenant brand for workflow context.',
    'input',
    'Layers',
  ],
  [
    'brandAsset',
    'Read Brand Asset',
    'Reads one tenant brand asset.',
    'input',
    'Image',
  ],
  [
    'brandContext',
    'Assemble Brand Context',
    'Assembles tenant brand context.',
    'input',
    'Layers',
  ],
  [
    'castPrompt',
    'Generate Cast Prompt',
    'Generates one cast-aware prompt.',
    'input',
    'Film',
  ],
  [
    'cinematicColorGrade',
    'Apply Cinematic Color Grade',
    'Applies cinematic color grading to media.',
    'processing',
    'Film',
  ],
  [
    'colorGrade',
    'Apply Color Grade',
    'Applies color grading to media.',
    'processing',
    'WandSparkles',
  ],
  [
    'effect-captions',
    'Add Captions',
    'Burns captions into one video.',
    'processing',
    'Captions',
  ],
  [
    'effect-ken-burns',
    'Apply Ken Burns Effect',
    'Applies a zoom and pan effect.',
    'processing',
    'Maximize',
  ],
  [
    'effect-portrait-blur',
    'Apply Portrait Blur',
    'Creates a portrait-blur composition.',
    'processing',
    'Image',
  ],
  [
    'effect-split-screen',
    'Create Split Screen',
    'Creates a split-screen composition.',
    'composition',
    'Columns2',
  ],
  [
    'effect-text-overlay',
    'Add Text Overlay',
    'Adds a text overlay to media.',
    'composition',
    'FileText',
  ],
  [
    'effect-watermark',
    'Add Watermark',
    'Adds a watermark to media.',
    'composition',
    'Image',
  ],
  [
    'filmGrain',
    'Apply Film Grain',
    'Applies film grain to media.',
    'processing',
    'Film',
  ],
  [
    'hookGenerator',
    'Generate Hook',
    'Generates one content hook.',
    'ai',
    'Sparkles',
  ],
  [
    'imageGen',
    'Generate Image',
    'Generates one image from workflow inputs.',
    'ai',
    'Image',
  ],
  [
    'input-template',
    'Load Prompt Template',
    'Loads one prompt template.',
    'input',
    'FileText',
  ],
  [
    'iterativeSeoRefine',
    'Refine SEO Iteratively',
    'Runs bounded SEO refinement.',
    'ai',
    'Brain',
  ],
  [
    'lensEffects',
    'Apply Lens Effects',
    'Applies selected lens effects.',
    'processing',
    'WandSparkles',
  ],
  [
    'lipSync',
    'Generate Lip Sync',
    'Generates one lip-synced media output.',
    'ai',
    'Mic',
  ],
  [
    'llm',
    'Generate Text',
    'Runs one language-model text generation.',
    'ai',
    'Brain',
  ],
  [
    'musicSource',
    'Resolve Music Source',
    'Resolves one workflow music source.',
    'input',
    'AudioLines',
  ],
  [
    'newsletterGen',
    'Generate Newsletter Draft',
    'Generates one newsletter draft.',
    'ai',
    'FileText',
  ],
  [
    'output-export',
    'Export Workflow Output',
    'Exports a workflow output file.',
    'output',
    'Download',
  ],
  [
    'output-notify',
    'Notify Workflow Output',
    'Sends a workflow completion notification.',
    'output',
    'MessageSquare',
  ],
  [
    'output-save',
    'Save Workflow Output',
    'Saves workflow output to the asset library.',
    'output',
    'Download',
  ],
  [
    'output-webhook',
    'Send Workflow Webhook',
    'Sends workflow output to a webhook.',
    'output',
    'Navigation',
  ],
  [
    'postGen',
    'Generate Post Draft',
    'Generates and persists one social post draft.',
    'ai',
    'FileText',
  ],
  [
    'promptConstructor',
    'Construct Prompt',
    'Constructs one prompt from workflow inputs.',
    'input',
    'Puzzle',
  ],
  [
    'postReply',
    'Post Social Reply',
    'Posts one social reply.',
    'output',
    'MessageSquare',
  ],
  [
    'process-compress',
    'Compress Video',
    'Compresses one video.',
    'processing',
    'Video',
  ],
  [
    'process-extract-audio',
    'Extract Audio',
    'Extracts audio from one video.',
    'processing',
    'AudioLines',
  ],
  [
    'process-merge-videos',
    'Merge Videos',
    'Merges workflow videos.',
    'processing',
    'Layers',
  ],
  [
    'process-mirror',
    'Mirror Video',
    'Mirrors one video.',
    'processing',
    'Video',
  ],
  [
    'process-resize',
    'Resize Media',
    'Resizes workflow media.',
    'processing',
    'Maximize',
  ],
  [
    'process-reverse',
    'Reverse Video',
    'Reverses one video.',
    'processing',
    'Video',
  ],
  [
    'process-transform',
    'Transform Media',
    'Transforms workflow media.',
    'processing',
    'WandSparkles',
  ],
  ['process-trim', 'Trim Video', 'Trims one video.', 'processing', 'Scissors'],
  [
    'publish',
    'Publish Social Content',
    'Publishes workflow content to social targets.',
    'output',
    'Navigation',
  ],
  [
    'reframe',
    'Reframe Media',
    'Reframes workflow media.',
    'processing',
    'Crop',
  ],
  [
    'reportDelivery',
    'Deliver Workflow Report',
    'Delivers one workflow report.',
    'output',
    'FileText',
  ],
  [
    'sendDm',
    'Send Direct Message',
    'Sends one social direct message.',
    'output',
    'MessageSquare',
  ],
  ['sendEmail', 'Send Email', 'Sends one email.', 'output', 'MessageSquare'],
  [
    'seoRewrite',
    'Rewrite for SEO',
    'Rewrites content using SEO guidance.',
    'ai',
    'Pencil',
  ],
  ['seoScore', 'Score SEO', 'Scores content for SEO.', 'processing', 'Eye'],
  [
    'socialRead',
    'Read Social Content',
    'Reads social content for workflow context.',
    'input',
    'Search',
  ],
  [
    'soundOverlay',
    'Overlay Sound',
    'Overlays sound on one video.',
    'processing',
    'Volume2',
  ],
  [
    'sourceCorpus',
    'Build Source Corpus',
    'Collects recent tenant source posts.',
    'input',
    'Layers',
  ],
  [
    'talkingHeadScript',
    'Generate Talking-head Script',
    'Generates a duration-bounded talking-head script.',
    'ai',
    'FileText',
  ],
  [
    'textToSpeech',
    'Generate Text to Speech',
    'Converts text to speech.',
    'ai',
    'AudioLines',
  ],
  [
    'trendDigest',
    'Build Trend Digest',
    'Builds one trends digest.',
    'composition',
    'Layers',
  ],
  [
    'trendHashtagInspiration',
    'Find Hashtag Inspiration',
    'Finds trend hashtag inspiration.',
    'ai',
    'Search',
  ],
  [
    'trendSoundInspiration',
    'Find Sound Inspiration',
    'Finds trend sound inspiration.',
    'ai',
    'AudioLines',
  ],
  [
    'trendTrigger',
    'Resolve Matching Trend',
    'Resolves one matching trend for workflow execution.',
    'input',
    'Search',
  ],
  [
    'trendVideoInspiration',
    'Find Video Inspiration',
    'Finds trend video inspiration.',
    'ai',
    'Video',
  ],
  [
    'upscale',
    'Upscale Media',
    'Upscales one media asset.',
    'processing',
    'Maximize',
  ],
  [
    'videoFrameExtract',
    'Extract Video Frames',
    'Extracts selected frames from one video.',
    'processing',
    'Film',
  ],
  [
    'videoGen',
    'Generate Video',
    'Generates one video from workflow inputs.',
    'ai',
    'Video',
  ],
  [
    'videoQa',
    'Validate Video Quality',
    'Validates one generated video.',
    'processing',
    'CircleCheckBig',
  ],
  [
    'videoStitch',
    'Stitch Videos',
    'Stitches workflow video segments.',
    'processing',
    'Layers',
  ],
  [
    'voiceChange',
    'Change Voice',
    'Changes the voice in one audio asset.',
    'ai',
    'AudioLines',
  ],
] as const satisfies readonly WorkflowActionCatalogEntry[];

const WORKFLOW_ACTION_CREDIT_POLICIES: Readonly<
  Record<string, ActionCreditPolicy>
> = {
  cinematicColorGrade: { amount: 2, mode: 'fixed' },
  colorGrade: { amount: 1, mode: 'fixed' },
  'effect-captions': { amount: 1, mode: 'fixed' },
  filmGrain: { amount: 1, mode: 'fixed' },
  hookGenerator: { amount: 1, mode: 'fixed' },
  imageGen: { amount: 5, mode: 'fixed' },
  iterativeSeoRefine: { amount: 15, mode: 'fixed' },
  lensEffects: { amount: 1, mode: 'fixed' },
  lipSync: { amount: 8, mode: 'fixed' },
  postReply: { amount: 1, mode: 'fixed' },
  'process-resize': { amount: 1, mode: 'fixed' },
  'process-transform': { amount: 1, mode: 'fixed' },
  reframe: { amount: 3, mode: 'fixed' },
  seoRewrite: { amount: 3, mode: 'fixed' },
  seoScore: { amount: 2, mode: 'fixed' },
  socialRead: { amount: 1, mode: 'fixed' },
  soundOverlay: { amount: 1, mode: 'fixed' },
  talkingHeadScript: { amount: 3, mode: 'fixed' },
  textToSpeech: { amount: 3, mode: 'fixed' },
  trendHashtagInspiration: { amount: 1, mode: 'fixed' },
  trendSoundInspiration: { amount: 1, mode: 'fixed' },
  trendVideoInspiration: { amount: 1, mode: 'fixed' },
  upscale: { amount: 2, mode: 'fixed' },
  videoFrameExtract: { amount: 2, mode: 'fixed' },
  videoGen: { amount: 10, mode: 'fixed' },
  videoQa: { amount: 1, mode: 'fixed' },
  videoStitch: { amount: 1, mode: 'fixed' },
  voiceChange: { amount: 5, mode: 'fixed' },
};

const WORKFLOW_ACTION_DEFINITIONS = WORKFLOW_ACTIONS.map(
  ([id, label, description, workflowCategory, workflowIcon]) =>
    internalAction(id, label, description, {
      credits: WORKFLOW_ACTION_CREDIT_POLICIES[id] ?? {
        amount: 0,
        mode: 'fixed',
      },
      visibility: 'workflow',
      workflowCategory,
      workflowIcon,
    }),
);

const AUTOMATION_ACTION_IDS = [
  'agent.autopilot.begin',
  'agent.autopilot.discover',
  'agent.autopilot.discover-credit-resets',
  'agent.autopilot.dispatch-strategy',
  'agent.autopilot.fail',
  'agent.autopilot.finalize',
  'agent.autopilot.reset-credit-window',
  'content.production.engine.begin',
  'content.production.engine.discover-brands',
  'content.production.engine.execute-mediaquery-item',
  'content.production.engine.fail',
  'content.production.engine.finalize-plan',
  'content.production.engine.finalize',
  'content.production.engine.persist-skill-item',
  'content.production.engine.plan-brand',
  'content.production.engine.prepare-plan',
  'content.production.engine.prepare-plan-item',
  'content.production.engine.run-skill-item',
  'content.production.autopilot.begin',
  'content.production.autopilot.discover-personas',
  'content.production.autopilot.fail',
  'content.production.autopilot.finalize',
  'content.production.autopilot.prepare-persona',
  'content.production.autopilot.schedule-persona',
  'harness.winners.begin',
  'harness.winners.discover-brands',
  'harness.winners.fail',
  'harness.winners.finalize-brand',
  'harness.winners.finalize',
  'harness.winners.prepare-brand',
  'harness.winners.promote-item',
  'livestream.sessions.begin',
  'livestream.sessions.discover',
  'livestream.sessions.fail',
  'livestream.sessions.finalize',
  'livestream.sessions.deliver-target',
  'livestream.sessions.discover-targets',
  'livestream.sessions.finalize-one',
  'livestream.sessions.load-one',
  'livestream.sessions.sync-restream',
  'livestream.restream.finalize',
  'livestream.restream.load-bot',
  'livestream.restream.sync-chat',
  'paid-creative.research.discover-advertisers',
  'paid-creative.research.finalize',
  'paid-creative.research.ingest-advertiser',
  'paid-creative.research.prepare',
  'reply.polling.bots.begin',
  'reply.polling.bots.discover-targets',
  'reply.polling.bots.fail',
  'reply.polling.bots.finalize',
  'reply.polling.bots.finalize-target',
  'reply.polling.bots.prepare-target',
  'reply.polling.social.begin',
  'reply.polling.social.discover-workflows',
  'reply.polling.social.fail',
  'reply.polling.social.finalize',
  'reply.polling.social.process-trigger',
  'trends.notifications.deliver-email',
  'trends.notifications.deliver-in-app',
  'trends.notifications.deliver-telegram',
  'trends.notifications.finalize',
  'trends.notifications.prepare',
  'trends.notifications.read-hashtags',
  'trends.notifications.read-sounds',
  'trends.notifications.read-videos',
  'trends.notifications.render',
] as const;

const AUTOMATION_ACTION_DEFINITIONS = AUTOMATION_ACTION_IDS.map((id) =>
  internalAction(
    id,
    id
      .split(/[.-]/)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' '),
    `Executes the atomic ${id} workflow operation.`,
  ),
);

const SYSTEM_MAINTENANCE_ACTIONS = [
  [
    'engagement.sweep.discover',
    'Discover Engagement Rules',
    'Discovers bounded armed engagement rules for a sweep.',
  ],
  [
    'engagement.sweep.evaluate',
    'Evaluate Engagement Rule',
    'Evaluates one scoped engagement rule and its eligibility.',
  ],
  [
    'engagement.sweep.execute',
    'Execute Engagement Rule',
    'Executes one eligible engagement-rule operation.',
  ],
  [
    'engagement.sweep.expire',
    'Expire Engagement Rules',
    'Expires engagement rules whose configured lifetime elapsed.',
  ],
  [
    'engagement.sweep.finalize-failure',
    'Finalize Failed Engagement Rule',
    'Persists one failed engagement-rule execution.',
  ],
  [
    'engagement.sweep.finalize-success',
    'Finalize Successful Engagement Rule',
    'Persists one successful engagement-rule execution.',
  ],
  [
    'engagement.sweep.mark-ineligible',
    'Mark Engagement Rule Ineligible',
    'Persists one ineligible engagement-rule evaluation.',
  ],
  [
    'engagement.sweep.publish',
    'Publish Engagement Output',
    'Publishes one prepared engagement-rule output.',
  ],
  [
    'review-gate.timeout.discover',
    'Discover Timed-out Review Gates',
    'Discovers bounded workflow review gates whose timeout elapsed.',
  ],
  [
    'review-gate.timeout.resolve',
    'Resolve Timed-out Review Gate',
    'Resolves one timed-out workflow review gate.',
  ],
  [
    'rss.item.claim',
    'Claim RSS Item',
    'Claims one RSS item for idempotent processing.',
  ],
  [
    'rss.item.create-release',
    'Create RSS Release',
    'Creates one release from a claimed RSS item.',
  ],
  [
    'rss.item.finalize',
    'Finalize RSS Item',
    'Finalizes one RSS item processing result.',
  ],
  [
    'rss.item.publish',
    'Publish RSS Release',
    'Publishes one prepared RSS release.',
  ],
  [
    'rss.source.fetch-items',
    'Fetch RSS Items',
    'Fetches bounded items from one enabled RSS source.',
  ],
  [
    'rss.source.finalize',
    'Finalize RSS Source',
    'Finalizes one RSS source processing result.',
  ],
  [
    'rss.sweep.discover-sources',
    'Discover RSS Sources',
    'Discovers bounded enabled RSS sources for a sweep.',
  ],
  [
    'streak.organization.discover-records',
    'Discover Streak Records',
    'Discovers bounded streak records for one organization.',
  ],
  [
    'streak.record.apply-freeze',
    'Apply Streak Freeze',
    'Applies one eligible streak freeze transition.',
  ],
  [
    'streak.record.break',
    'Break Streak',
    'Applies one expired streak transition.',
  ],
  [
    'streak.record.evaluate',
    'Evaluate Streak Record',
    'Evaluates one streak record for reminders, freezes, or breaks.',
  ],
  [
    'streak.record.notify-at-risk',
    'Notify At-risk Streak',
    'Sends one at-risk streak notification.',
  ],
  [
    'streak.record.notify-broken',
    'Notify Broken Streak',
    'Sends one broken-streak notification.',
  ],
  [
    'streak.record.notify-freeze',
    'Notify Streak Freeze',
    'Sends one streak-freeze notification.',
  ],
  [
    'streak.sweep.discover-organizations',
    'Discover Streak Organizations',
    'Discovers organizations with streak records due for maintenance.',
  ],
  [
    'tiktok.status.discover',
    'Discover TikTok Status Work',
    'Discovers pending TikTok publications requiring reconciliation.',
  ],
  [
    'tiktok.status.reconcile',
    'Reconcile TikTok Status',
    'Reconciles one pending TikTok publication.',
  ],
  [
    'trends.maintenance.discover-scoped',
    'Discover Scoped Trend Accounts',
    'Discovers connected social accounts eligible for native trend refresh.',
  ],
  [
    'trends.maintenance.expire-hashtags',
    'Expire Trend Hashtags',
    'Expires stale trend hashtag records.',
  ],
  [
    'trends.maintenance.expire-sounds',
    'Expire Trend Sounds',
    'Expires stale trend sound records.',
  ],
  [
    'trends.maintenance.expire-trends',
    'Expire Trends',
    'Expires stale trend records.',
  ],
  [
    'trends.maintenance.expire-videos',
    'Expire Trend Videos',
    'Expires stale trend video records.',
  ],
  [
    'trends.maintenance.fetch-dataset',
    'Fetch Trend Dataset',
    'Fetches one configured trend dataset.',
  ],
  [
    'trends.maintenance.fetch-global',
    'Fetch Global Trends',
    'Fetches current global trend signals.',
  ],
  [
    'trends.maintenance.fetch-sounds',
    'Fetch Trend Sounds',
    'Fetches current trending sound signals.',
  ],
  [
    'trends.maintenance.fetch-scoped',
    'Fetch Scoped Trends',
    'Fetches one tenant-isolated trend dataset through its native integration.',
  ],
  [
    'trends.maintenance.precompute-preview',
    'Precompute Trend Preview',
    'Precomputes the current public trend preview.',
  ],
  [
    'workflow.artifact.cleanup-expired-scope',
    'Clean Up Expired Artifact Scope',
    'Deletes expired artifacts and payloads for one bounded execution scope.',
  ],
  [
    'workflow.artifact.discover-expired',
    'Discover Expired Workflow Artifacts',
    'Discovers bounded workflow artifact scopes due for cleanup.',
  ],
  [
    'youtube.comments.discover-credentials',
    'Discover YouTube Comment Credentials',
    'Discovers connected YouTube credentials requiring comment ingestion.',
  ],
  [
    'youtube.status.discover-posts',
    'Discover YouTube Status Work',
    'Discovers pending YouTube posts requiring reconciliation.',
  ],
  [
    'youtube.status.reconcile',
    'Reconcile YouTube Status',
    'Reconciles one pending YouTube post.',
  ],
] as const;

const SYSTEM_MAINTENANCE_ACTION_DEFINITIONS = SYSTEM_MAINTENANCE_ACTIONS.map(
  ([id, label, description]) => internalAction(id, label, description),
);

const BRAND_REMIX_ACTIONS = [
  [
    'brand-remix.execute.adopt-orphans',
    'Adopt Brand Remix Orphans',
    'Adopts orphaned remix placeholders onto claimed variants.',
  ],
  [
    'brand-remix.execute.claim',
    'Claim Brand Remix Generation',
    'Claims one remix run for idempotent generation.',
  ],
  [
    'brand-remix.execute.dispatch-media',
    'Dispatch Brand Remix Media',
    'Dispatches claimed remix media variants through their provider executors.',
  ],
  [
    'brand-remix.execute.generate-copy',
    'Generate Brand Remix Copy',
    'Generates copy variants for one claimed remix run.',
  ],
  [
    'brand-remix.execute.prepare',
    'Prepare Brand Remix Execution',
    'Validates and snapshots one remix run before generation.',
  ],
  [
    'brand-remix.execute.project',
    'Project Brand Remix Execution',
    'Projects one remix generation into its response contract.',
  ],
  [
    'brand-remix.execute.reconcile',
    'Reconcile Brand Remix Execution',
    'Reconciles remix variant state after generation.',
  ],
  [
    'brand-remix.meta.create-ad',
    'Create Brand Remix Meta Ad',
    'Creates one paused Meta ad from prepared remix creative.',
  ],
  [
    'brand-remix.meta.ensure-ad-set',
    'Ensure Brand Remix Meta Ad Set',
    'Ensures the scoped paused Meta ad set exists.',
  ],
  [
    'brand-remix.meta.ensure-campaign',
    'Ensure Brand Remix Meta Campaign',
    'Ensures the scoped paused Meta campaign exists.',
  ],
  [
    'brand-remix.meta.find-ad',
    'Find Brand Remix Meta Ad',
    'Finds an existing Meta ad for an idempotent remix draft.',
  ],
  [
    'brand-remix.meta.pause-ad',
    'Pause Brand Remix Meta Ad',
    'Confirms the created Meta ad remains paused.',
  ],
  [
    'brand-remix.meta.pause-ad-set',
    'Pause Brand Remix Meta Ad Set',
    'Confirms the remix Meta ad set remains paused.',
  ],
  [
    'brand-remix.meta.pause-campaign',
    'Pause Brand Remix Meta Campaign',
    'Confirms the remix Meta campaign remains paused.',
  ],
  [
    'brand-remix.meta.persist-lineage',
    'Persist Brand Remix Meta Lineage',
    'Persists source lineage for one Meta remix draft.',
  ],
  [
    'brand-remix.meta.persist-mapping',
    'Persist Brand Remix Meta Mapping',
    'Persists provider identifiers for one Meta remix draft.',
  ],
  [
    'brand-remix.meta.prepare-creative',
    'Prepare Brand Remix Meta Creative',
    'Prepares one validated Meta remix creative.',
  ],
  [
    'brand-remix.meta.resolve-account',
    'Resolve Brand Remix Meta Account',
    'Resolves the scoped Meta advertising account.',
  ],
  [
    'brand-remix.meta.validate-source',
    'Validate Brand Remix Meta Source',
    'Validates the source content for a Meta remix draft.',
  ],
  [
    'brand-remix.review.claim',
    'Claim Brand Remix Review',
    'Claims one remix result for idempotent review handoff.',
  ],
  [
    'brand-remix.review.complete',
    'Complete Brand Remix Review',
    'Completes one claimed remix review handoff.',
  ],
  [
    'brand-remix.review.create-handoff',
    'Create Brand Remix Review Handoff',
    'Creates canonical draft posts for one remix review handoff.',
  ],
  [
    'brand-remix.review.prepare',
    'Prepare Brand Remix Review',
    'Loads and validates one remix review request.',
  ],
  [
    'brand-remix.review.project',
    'Project Brand Remix Review',
    'Projects one review handoff into its response contract.',
  ],
  [
    'brand-remix.review.record-lineage',
    'Record Brand Remix Review Lineage',
    'Records source trend lineage for one remix review batch.',
  ],
  [
    'brand-remix.x.ensure-campaign',
    'Ensure Brand Remix X Campaign',
    'Ensures the scoped paused X Ads campaign exists.',
  ],
  [
    'brand-remix.x.ensure-line-item',
    'Ensure Brand Remix X Line Item',
    'Ensures the scoped paused X Ads line item exists.',
  ],
  [
    'brand-remix.x.ensure-promoted-tweet',
    'Ensure Brand Remix Promoted Post',
    'Ensures the scoped promoted X post exists.',
  ],
  [
    'brand-remix.x.persist-lineage',
    'Persist Brand Remix X Lineage',
    'Persists source lineage for one X remix draft.',
  ],
  [
    'brand-remix.x.persist-mapping',
    'Persist Brand Remix X Mapping',
    'Persists provider identifiers for one X remix draft.',
  ],
  [
    'brand-remix.x.resolve-account',
    'Resolve Brand Remix X Account',
    'Resolves the scoped X advertising account.',
  ],
  [
    'brand-remix.x.resolve-funding',
    'Resolve Brand Remix X Funding',
    'Resolves the scoped X Ads funding instrument.',
  ],
  [
    'brand-remix.x.validate-source',
    'Validate Brand Remix X Source',
    'Validates the source content for an X remix draft.',
  ],
  [
    'brand-remix.x.validate-tweet',
    'Validate Brand Remix X Post',
    'Validates the source X post for promotion.',
  ],
] as const;

const BRAND_REMIX_ACTION_DEFINITIONS = BRAND_REMIX_ACTIONS.map(
  ([id, label, description]) => internalAction(id, label, description),
);

const INTERNAL_ACTIONS: readonly GenfeedActionDefinition[] = [
  ...WORKFLOW_ACTION_DEFINITIONS,
  ...AUTOMATION_ACTION_DEFINITIONS,
  ...SYSTEM_MAINTENANCE_ACTION_DEFINITIONS,
  ...BRAND_REMIX_ACTION_DEFINITIONS,
  internalAction(
    'admin.announcement.persist',
    'Persist Announcement',
    'Persists one announcement after its workflow-backed delivery attempts.',
  ),
  internalAction(
    'admin.announcement.publish-discord',
    'Publish Announcement to Discord',
    'Publishes one announcement to its configured Discord channel.',
  ),
  internalAction(
    'admin.announcement.publish-twitter',
    'Publish Announcement to X',
    'Publishes one announcement to its configured X account.',
  ),
  internalAction(
    'agent.turn.prepare',
    'Prepare Agent Turn',
    'Validates and snapshots one durable bearer-free agent turn state.',
  ),
  internalAction(
    'agent.turn.infer',
    'Infer Agent Turn',
    'Produces one final response or a bounded set of workflow-backed tool calls.',
  ),
  internalAction(
    'agent.turn.finalize',
    'Finalize Agent Turn',
    'Persists the final assistant message and durable thread projection.',
  ),
  internalAction(
    'agent.turn.fail',
    'Fail Agent Turn',
    'Records one safe terminal agent-turn failure.',
  ),
  internalAction(
    'agent.thread.ui-action.execute',
    'Execute Agent Thread UI Action',
    'Executes one authorized UI action for an agent thread inside a workflow execution.',
  ),
  internalAction(
    'agent.thread.input-response.execute',
    'Resume Agent Thread Input Request',
    'Applies one validated human input response and resumes the paused agent thread operation.',
  ),
  internalAction(
    'ai-influencer.caption.generate',
    'Generate AI Influencer Caption',
    'Generates one caption for an AI influencer post.',
  ),
  internalAction(
    'ai-influencer.daily.discover',
    'Discover AI Influencer Daily Work',
    'Discovers the bounded personas due for daily post generation.',
  ),
  internalAction(
    'ai-influencer.daily.finalize',
    'Finalize AI Influencer Daily Work',
    'Finalizes one AI influencer daily-post workflow.',
  ),
  internalAction(
    'ai-influencer.daily.mark-run',
    'Mark AI Influencer Daily Run',
    'Records one AI influencer daily-post run for idempotent scheduling.',
  ),
  internalAction(
    'ai-influencer.daily.prepare',
    'Prepare AI Influencer Daily Post',
    'Prepares one discovered persona for daily post generation.',
  ),
  internalAction(
    'ai-influencer.image.generate',
    'Generate AI Influencer Image',
    'Generates one image for an AI influencer post.',
  ),
  internalAction(
    'ai-influencer.image.prepare',
    'Prepare AI Influencer Image',
    'Builds the image-generation input for one AI influencer post.',
  ),
  internalAction(
    'ai-influencer.ingredient.create',
    'Create AI Influencer Ingredient',
    'Persists one generated AI influencer media ingredient.',
  ),
  internalAction(
    'ai-influencer.persona.load',
    'Load AI Influencer Persona',
    'Loads one tenant-scoped AI influencer persona for generation.',
  ),
  internalAction(
    'ai-influencer.platform.publish',
    'Publish AI Influencer Platform Post',
    'Publishes one prepared AI influencer post to one platform.',
  ),
  internalAction(
    'ai-influencer.post.finalize',
    'Finalize AI Influencer Post',
    'Finalizes one generated AI influencer post and its workflow provenance.',
  ),
  internalAction(
    'ai-influencer.publish.plan',
    'Plan AI Influencer Publishing',
    'Builds bounded platform publishing inputs for one AI influencer post.',
  ),
  internalAction(
    'ai-influencer.video.generate',
    'Generate AI Influencer Video',
    'Generates one video for an AI influencer post.',
  ),
  internalAction(
    'ai-influencer.video.plan',
    'Plan AI Influencer Video',
    'Builds the video-generation input for one AI influencer post.',
  ),
  internalAction(
    'ai-influencer.voice.generate',
    'Generate AI Influencer Voice',
    'Generates one voice track for an AI influencer video.',
  ),
  internalAction(
    'ads.credentials.discover',
    'Discover Ads Credentials',
    'Discovers bounded connected ad credentials for one provider workflow.',
  ),
  internalAction(
    'ads.google.performance.fetch',
    'Fetch Google Ads Performance',
    'Fetches scoped Google Ads performance records.',
  ),
  internalAction(
    'ads.google.performance.normalize',
    'Normalize Google Ads Performance',
    'Normalizes Google Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.meta.performance.fetch',
    'Fetch Meta Ads Performance',
    'Fetches scoped Meta Ads performance records.',
  ),
  internalAction(
    'ads.meta.performance.normalize',
    'Normalize Meta Ads Performance',
    'Normalizes Meta Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.tiktok.performance.fetch',
    'Fetch TikTok Ads Performance',
    'Fetches scoped TikTok Ads performance records.',
  ),
  internalAction(
    'ads.tiktok.performance.normalize',
    'Normalize TikTok Ads Performance',
    'Normalizes TikTok Ads performance into the shared record shape.',
  ),
  internalAction(
    'ads.performance.persist',
    'Persist Ads Performance',
    'Persists normalized tenant-scoped ad performance records.',
  ),
  internalAction(
    'ads.optimization.load-config',
    'Load Ads Optimization Config',
    'Loads the scoped policy for one ads optimization workflow.',
  ),
  internalAction(
    'ads.optimization.analyze',
    'Analyze Ads Optimization',
    'Analyzes normalized ad performance against its optimization policy.',
  ),
  internalAction(
    'ads.optimization.persist-recommendations',
    'Persist Ads Recommendations',
    'Persists recommendations produced by one ads optimization workflow.',
  ),
  internalAction(
    'ads.optimization.finalize',
    'Finalize Ads Optimization',
    'Finalizes one ads optimization workflow and audit record.',
  ),
  internalAction(
    'ads.bulk-upload.claim',
    'Claim Ad Bulk Upload',
    'Claims one ad bulk-upload job for workflow execution.',
  ),
  internalAction(
    'ads.bulk-upload.build-media-items',
    'Build Ad Media Items',
    'Builds bounded media upload items for one ad bulk-upload job.',
  ),
  internalAction(
    'ads.bulk-upload.upload-media',
    'Upload Ad Media',
    'Uploads one ad media item through its scoped provider account.',
  ),
  internalAction(
    'ads.bulk-upload.build-permutations',
    'Build Ad Permutations',
    'Builds bounded creative permutations from uploaded ad media.',
  ),
  internalAction(
    'ads.bulk-upload.create-ad',
    'Create Bulk Ad',
    'Creates one ad from a validated bulk-upload permutation.',
  ),
  internalAction(
    'ads.bulk-upload.finalize',
    'Finalize Ad Bulk Upload',
    'Finalizes one completed ad bulk-upload workflow.',
  ),
  internalAction(
    'ads.bulk-upload.fail',
    'Fail Ad Bulk Upload',
    'Projects a terminal workflow failure onto one ad bulk-upload job.',
  ),
  internalAction(
    'analytics.posts.discover',
    'Discover Analytics Posts',
    'Discovers bounded tenant posts requiring analytics collection.',
  ),
  internalAction(
    'analytics.facebook.collect',
    'Collect Facebook Analytics',
    'Collects and persists analytics for one Facebook post.',
  ),
  internalAction(
    'analytics.social.collect',
    'Collect Social Analytics',
    'Collects and persists analytics for one supported social post.',
  ),
  internalAction(
    'analytics.threads.collect',
    'Collect Threads Analytics',
    'Collects and persists analytics for one Threads post.',
  ),
  internalAction(
    'analytics.twitter.collect',
    'Collect X Analytics',
    'Collects and persists analytics for one X post.',
  ),
  internalAction(
    'analytics.youtube.collect',
    'Collect YouTube Analytics',
    'Collects and persists analytics for one YouTube post.',
  ),
  internalAction(
    'analytics.collection.finalize',
    'Finalize Analytics Collection',
    'Finalizes one bounded provider analytics collection workflow.',
  ),
  internalAction(
    'analytics.generic.resolve-window',
    'Resolve Analytics Window',
    'Resolves and validates one generic analytics collection window.',
  ),
  internalAction(
    'analytics.generic.discover',
    'Discover Generic Analytics Items',
    'Discovers bounded generic analytics items for child workflows.',
  ),
  internalAction(
    'analytics.generic.persist',
    'Persist Generic Analytics',
    'Persists analytics for one discovered generic item.',
  ),
  internalAction(
    'analytics.generic.sync-memory',
    'Sync Analytics Memory',
    'Synchronizes durable brand memory from collected analytics.',
  ),
  internalAction(
    'analytics.generic.detect-alerts',
    'Detect Analytics Alerts',
    'Detects and records alerts from collected analytics.',
  ),
  internalAction(
    'content.pipeline.generate-image',
    'Generate Pipeline Image',
    'Generates and persists one image for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-music',
    'Generate Pipeline Music',
    'Generates and persists one music asset for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-speech',
    'Generate Pipeline Speech',
    'Generates and persists one speech asset for a content workflow.',
  ),
  internalAction(
    'content.pipeline.generate-video',
    'Generate Pipeline Video',
    'Generates and persists one video for a content workflow.',
  ),
  internalAction(
    'content.pipeline.publish',
    'Publish Content Pipeline Output',
    'Publishes the selected generated assets for one persona.',
  ),
  internalAction(
    'content.pipeline.resolve-context',
    'Resolve Content Pipeline Context',
    'Resolves one persona and its immutable brand references.',
  ),
  internalAction(
    'article.review',
    'Review Article',
    'Reviews one tenant article with the configured rubric.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.generation.finalize',
    'Finalize Article Generation',
    'Finalizes one article generation workflow and its selected drafts.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.generation.generate-drafts',
    'Generate Article Drafts',
    'Generates candidate article drafts from prepared tenant context.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'article.header-prompt.generate',
    'Generate Article Header Prompt',
    'Generates one header-image prompt from prepared article context.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'article.header-prompt.load',
    'Load Article Header Prompt Context',
    'Loads tenant-scoped article context for header-prompt generation.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.header-prompt.persist',
    'Persist Article Header Prompt',
    'Persists one generated header-image prompt on its tenant article.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.generation.invalidate-cache',
    'Invalidate Article Cache',
    'Invalidates cached article views after generation completes.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.generation.load-context',
    'Load Article Generation Context',
    'Loads tenant-scoped context for one article generation workflow.',
    { authorization: 'user' },
  ),
  internalAction(
    'article.generation.persist-draft',
    'Persist Article Generation Draft',
    'Persists one reviewed and revised article draft.',
  ),
  internalAction(
    'article.generation.review-draft',
    'Review Article Draft',
    'Reviews one generated article draft against the prepared rubric.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'article.generation.revise-draft',
    'Revise Article Draft',
    'Revises one article draft from its structured review feedback.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'article.review.load-context',
    'Load Article Review Context',
    'Loads the tenant-scoped article and rubric for one review workflow.',
    { authorization: 'user' },
  ),
  internalAction(
    'campaign.reply.discover-targets',
    'Discover Campaign Reply Targets',
    'Discovers the bounded pending targets for one reply campaign run.',
  ),
  internalAction(
    'campaign.reply.claim',
    'Claim Campaign Reply Target',
    'Claims one campaign reply target for workflow execution.',
  ),
  internalAction(
    'campaign.reply.load-context',
    'Load Campaign Reply Context',
    'Loads the scoped context required to generate one campaign reply.',
  ),
  internalAction(
    'campaign.reply.generate',
    'Generate Campaign Reply',
    'Generates one campaign reply from the claimed target context.',
  ),
  internalAction(
    'campaign.reply.reserve',
    'Reserve Campaign Reply Slot',
    'Reserves rate-limit capacity for one campaign reply.',
  ),
  internalAction(
    'campaign.reply.send',
    'Send Campaign Reply',
    'Sends one reserved campaign reply through its connected account.',
  ),
  internalAction(
    'campaign.reply.finalize',
    'Finalize Campaign Reply',
    'Finalizes one campaign reply target and its campaign counters.',
  ),
  internalAction(
    'campaign.dm.discover-targets',
    'Discover Campaign DM Targets',
    'Discovers the bounded pending targets for one direct-message campaign run.',
  ),
  internalAction(
    'campaign.dm.claim',
    'Claim Campaign DM Target',
    'Claims one campaign direct-message target for workflow execution.',
  ),
  internalAction(
    'campaign.dm.resolve-context',
    'Resolve Campaign DM Context',
    'Resolves the scoped account and recipient context for one campaign direct message.',
  ),
  internalAction(
    'campaign.dm.generate',
    'Generate Campaign DM',
    'Generates one campaign direct message from the claimed target context.',
  ),
  internalAction(
    'campaign.dm.reserve',
    'Reserve Campaign DM Slot',
    'Reserves rate-limit capacity for one campaign direct message.',
  ),
  internalAction(
    'campaign.dm.send',
    'Send Campaign DM',
    'Sends one reserved campaign direct message through its connected account.',
  ),
  internalAction(
    'campaign.dm.finalize',
    'Finalize Campaign DM',
    'Finalizes one campaign direct-message target and its campaign counters.',
  ),
  internalAction(
    'campaign.dispatch.discover',
    'Discover Active Campaigns',
    'Discovers the bounded active campaigns for one tenant dispatch run.',
  ),
  internalAction(
    'campaign.dispatch.finalize',
    'Finalize Campaign Dispatch',
    'Finalizes one tenant campaign dispatch after all child workflows settle.',
  ),
  internalAction(
    'campaign.reply.preview.validate',
    'Validate Campaign Reply Preview',
    'Validates one campaign reply preview request and its tenant context.',
  ),
  internalAction(
    'campaign.reply.preview.generate',
    'Generate Campaign Reply Preview',
    'Generates one campaign reply preview from validated context.',
  ),
  internalAction(
    'clip.analysis.detect-highlights',
    'Detect Clip Highlights',
    'Detects and scores clip highlights in one transcript.',
  ),
  internalAction(
    'clip.analysis.extract-reference-frames',
    'Extract Clip Reference Frames',
    'Extracts bounded reference frames for clip highlights.',
  ),
  internalAction(
    'clip.analysis.fail',
    'Fail Clip Analysis',
    'Persists one failed clip analysis.',
  ),
  internalAction(
    'clip.generation.generate-one',
    'Generate One Clip',
    'Creates and dispatches exactly one clip result.',
  ),
  internalAction(
    'clip.generation.plan',
    'Plan Clip Generation',
    'Validates detected highlights and plans immutable child clip-generation inputs.',
  ),
  internalAction(
    'clip.factory.fail',
    'Fail Clip Factory',
    'Projects a terminal clip-factory workflow failure onto its source project.',
  ),
  internalAction(
    'clip.generation.finalize-child',
    'Finalize Clip Factory Child',
    'Reconciles project progress after one clip-generation child succeeds or fails.',
  ),
  internalAction(
    'clip.handoff.create-editor',
    'Create Clip Editor Handoff',
    'Creates one editor project from a ready clip.',
  ),
  internalAction(
    'clip.handoff.link-library',
    'Link Clip to Library',
    'Links one completed clip to its canonical Library asset.',
  ),
  internalAction(
    'clip.handoff.prepare-publish',
    'Prepare Clip Publish Handoff',
    'Builds one user-confirmed publish handoff for a ready clip.',
  ),
  internalAction(
    'clip.continuity.begin',
    'Begin Clip Continuity QA',
    'Claims one queued clip project continuity run.',
  ),
  internalAction(
    'clip.continuity.fail',
    'Fail Clip Continuity QA',
    'Projects a failed queued continuity workflow onto its clip project.',
  ),
  internalAction(
    'clip.continuity.persist-report',
    'Persist Clip Continuity Report',
    'Persists one aggregate continuity report and its workflow provenance.',
  ),
  internalAction(
    'clip.analysis.persist',
    'Persist Clip Analysis',
    'Persists one completed clip analysis.',
  ),
  internalAction(
    'clip.analysis.prepare-source',
    'Prepare Clip Analysis Source',
    'Prepares one clip-analysis source for transcription.',
  ),
  internalAction(
    'clip.analysis.transcribe',
    'Transcribe Clip Analysis Source',
    'Transcribes one prepared clip-analysis source.',
  ),
  internalAction(
    'content.batch.plan',
    'Plan Content Batch',
    'Builds the bounded child inputs for one content batch.',
  ),
  internalAction(
    'content.batch.item.prepare',
    'Prepare Content Batch Item',
    'Projects one batch item into the exact input of a fixed skill workflow.',
  ),
  internalAction(
    'content.batch.rank',
    'Rank Content Batch',
    'Ranks the completed items in one content batch.',
  ),
  internalAction(
    'content.optimization.summary.load',
    'Load Optimization Summary',
    'Loads the tenant-scoped summary for one optimization run.',
  ),
  internalAction(
    'content.optimization.cycle.run',
    'Run Optimization Cycle',
    'Runs one bounded content optimization cycle.',
  ),
  internalAction(
    'content.optimization.analysis.derive',
    'Derive Optimization Analysis',
    'Derives optimization analysis from scoped performance data.',
  ),
  internalAction(
    'content.optimization.prompt.load-context',
    'Load Optimization Prompt Context',
    'Loads the scoped content context required for prompt optimization.',
  ),
  internalAction(
    'content.optimization.prompt.optimize',
    'Optimize Content Prompt',
    'Produces one optimized content prompt from approved context.',
  ),
  internalAction(
    'content.optimization.recommendations.derive',
    'Derive Optimization Recommendations',
    'Derives recommendations from one content optimization analysis.',
  ),
  internalAction(
    'content.optimization.suggestions.generate',
    'Generate Optimization Suggestions',
    'Generates bounded suggestions for one content optimization run.',
  ),
  internalAction(
    'content.optimization.suggestion.apply',
    'Apply Optimization Suggestion',
    'Applies one approved content optimization suggestion.',
  ),
  internalAction(
    'content.optimization.winner.requeue',
    'Requeue Optimization Winner',
    'Requeues the winning content variant for its next workflow.',
  ),
  internalAction(
    'content.optimization.ab-test.execution.plan',
    'Plan Optimization A/B Test',
    'Plans the bounded arms for one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.arm.create',
    'Create Optimization A/B Arm',
    'Creates one arm for an optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.execution.finalize',
    'Finalize Optimization A/B Test',
    'Finalizes the creation of one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.resolution.plan',
    'Plan A/B Test Resolution',
    'Plans outcome collection for one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.outcome.persist',
    'Persist A/B Test Outcome',
    'Persists one outcome for an optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.resolution.finalize',
    'Finalize A/B Test Resolution',
    'Finalizes the resolved outcome of one optimization A/B test.',
  ),
  internalAction(
    'content.optimization.ab-test.validated.load',
    'Load Validated A/B Test',
    'Loads one validated optimization A/B test for resolution.',
  ),
  internalAction(
    'patterns.extraction.load',
    'Load Pattern Extraction Context',
    'Loads one organization-scoped pattern extraction context.',
  ),
  internalAction(
    'patterns.extraction.scan-ads',
    'Scan Ad Patterns',
    'Scans tenant-scoped ads for anonymous pattern signals.',
  ),
  internalAction(
    'patterns.extraction.scan-content',
    'Scan Content Patterns',
    'Scans tenant-scoped content for anonymous pattern signals.',
  ),
  internalAction(
    'patterns.extraction.build',
    'Build Pattern Candidates',
    'Builds anonymous pattern candidates from one tenant scan.',
  ),
  internalAction(
    'patterns.extraction.persist-candidate',
    'Persist Pattern Candidate',
    'Persists one anonymous candidate and promotes cross-tenant patterns at the privacy threshold.',
  ),
  internalAction(
    'patterns.extraction.save-checkpoints',
    'Save Pattern Extraction Checkpoints',
    'Saves tenant-scoped checkpoints after pattern extraction.',
  ),
  internalAction(
    'content-intelligence.generate',
    'Generate Content Intelligence Item',
    'Generates one platform-aware content item from prepared context.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'content-intelligence.generate-freeform',
    'Generate Freeform Content Intelligence',
    'Generates one freeform content result from prepared tenant context.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'content-intelligence.generate-linkedin-pattern',
    'Generate LinkedIn Content Pattern',
    'Generates one LinkedIn content variation from a selected intelligence pattern.',
  ),
  internalAction(
    'content-intelligence.load-context',
    'Load Content Intelligence Context',
    'Loads the tenant-scoped context for one content generation workflow.',
    { authorization: 'user' },
  ),
  internalAction(
    'content-intelligence.load-patterns',
    'Load Content Intelligence Patterns',
    'Loads relevant reusable content patterns for one generation workflow.',
    { authorization: 'user' },
  ),
  internalAction(
    'content-intelligence.plan',
    'Plan Content Intelligence Generation',
    'Builds bounded platform generation items from prepared context.',
    { authorization: 'user' },
  ),
  internalAction(
    'content-intelligence.track-pattern',
    'Track Content Intelligence Pattern',
    'Records anonymous pattern usage for one generated content item.',
    { authorization: 'user' },
  ),
  internalAction(
    'content-intelligence.finalize',
    'Finalize Content Intelligence Generation',
    'Finalizes one content intelligence workflow and its generated outputs.',
    { authorization: 'user' },
  ),
  internalAction(
    'evergreen-release-expansion',
    'Evergreen Release Expansion',
    'Materializes the next bounded evergreen release.',
  ),
  internalAction(
    'long-form.persist-output',
    'Persist Long-form Output',
    'Persists exactly one selected long-form output.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'long-form.transform-text',
    'Transform Long-form Text',
    'Transforms a transcript into one validated long-form document.',
    {
      authorization: 'public',
      credits: { mode: 'dynamic' },
      visibility: 'public',
    },
  ),
  internalAction(
    'newsletter.generate-draft',
    'Generate Newsletter Draft',
    'Generates and persists one tenant newsletter draft.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'newsletter.generate-topics',
    'Generate Newsletter Topics',
    'Generates tenant-scoped newsletter topic proposals.',
    { authorization: 'user', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'newsletter.load-draft-context',
    'Load Newsletter Draft Context',
    'Loads the tenant-scoped context required to generate one newsletter draft.',
    { authorization: 'user' },
  ),
  internalAction(
    'newsletter.load-topic-context',
    'Load Newsletter Topic Context',
    'Loads the tenant-scoped context required to generate newsletter topics.',
    { authorization: 'user' },
  ),
  internalAction(
    'newsletter.persist-draft',
    'Persist Newsletter Draft',
    'Persists one generated newsletter draft with workflow provenance.',
    { authorization: 'user' },
  ),
  internalAction(
    'reply-bot.organization.discover-bots',
    'Discover Organization Reply Bots',
    'Discovers enabled reply bots for one organization workflow.',
  ),
  internalAction(
    'reply-bot.organization.finalize',
    'Finalize Organization Reply Bots',
    'Finalizes one organization-level reply-bot workflow.',
  ),
  internalAction(
    'reply-bot.bot.fetch-candidates',
    'Fetch Reply Bot Candidates',
    'Fetches bounded candidate content for one reply bot.',
  ),
  internalAction(
    'reply-bot.bot.finalize',
    'Finalize Reply Bot',
    'Finalizes one bot-level candidate processing workflow.',
  ),
  internalAction(
    'reply-bot.content.claim',
    'Claim Reply Bot Content',
    'Claims one candidate content item for reply-bot processing.',
  ),
  internalAction(
    'reply-bot.content.generate-reply',
    'Generate Reply Bot Reply',
    'Generates one reply for a claimed content item.',
  ),
  internalAction(
    'reply-bot.content.generate-dm',
    'Generate Reply Bot DM',
    'Generates an optional direct message for a claimed content item.',
  ),
  internalAction(
    'reply-bot.content.send-reply',
    'Send Reply Bot Reply',
    'Sends one generated reply through its scoped connected account.',
  ),
  internalAction(
    'reply-bot.content.finalize',
    'Finalize Reply Bot Content',
    'Finalizes one processed reply-bot content item.',
  ),
  internalAction(
    'reply-bot.dm.send',
    'Send Reply Bot DM',
    'Sends one scheduled reply-bot direct message.',
  ),
  internalAction(
    'reply-bot.dm.finalize',
    'Finalize Reply Bot DM',
    'Finalizes one reply-bot direct-message workflow.',
  ),
  internalAction(
    'reply-bot.test.load',
    'Load Reply Bot Test',
    'Loads scoped configuration for one reply-bot generation test.',
  ),
  internalAction(
    'reply-bot.test.finalize',
    'Finalize Reply Bot Test',
    'Returns the validated output of one reply-bot generation test.',
  ),
  internalAction(
    'author-reply.resolve-intent',
    'Resolve Author Reply Intent',
    'Resolves and validates the requested author-reply operation.',
  ),
  internalAction(
    'author-reply.resolve-credential',
    'Resolve Author Reply Credential',
    'Resolves the scoped connected account for an author reply.',
  ),
  internalAction(
    'author-reply.generate-draft',
    'Generate Author Reply Draft',
    'Generates one author reply from the resolved intent and context.',
  ),
  internalAction(
    'author-reply.finalize-draft',
    'Finalize Author Reply Draft',
    'Returns the validated typed result for an author-reply draft.',
  ),
  internalAction(
    'author-reply.send',
    'Send Author Reply',
    'Sends one author reply through its connected account.',
  ),
  internalAction(
    'author-reply.finalize-send',
    'Finalize Author Reply Send',
    'Records the closed loop for one sent author reply.',
  ),
  internalAction(
    'reply.inbound.prepare',
    'Prepare Inbound Reply',
    'Validates and prepares one inbound reply event for child processing.',
  ),
  internalAction(
    'reply.inbound.finalize',
    'Finalize Inbound Reply',
    'Finalizes one inbound reply workflow after its child action settles.',
  ),
  internalAction(
    'reply.post-watch.fetch',
    'Fetch Watched Post Replies',
    'Fetches bounded inbound replies for one watched social post.',
  ),
  internalAction(
    'reply.post-watch.finalize',
    'Finalize Watched Post Run',
    'Finalizes one watched-post workflow after its inbound children settle.',
  ),
  internalAction(
    'social.inbox.outbound.reserve',
    'Reserve Social Inbox Outbound',
    'Validates and reserves one social inbox outbound operation.',
  ),
  internalAction(
    'social.inbox.outbound.provider',
    'Send Social Inbox Outbound',
    'Sends one reserved social inbox reply or direct message.',
  ),
  internalAction(
    'social.inbox.outbound.finalize',
    'Finalize Social Inbox Outbound',
    'Finalizes conversation state after one social inbox outbound operation.',
  ),
  internalAction(
    'social.inbox.sync.validate',
    'Validate Social Inbox Sync',
    'Validates one tenant-scoped social inbox synchronization request.',
  ),
  internalAction(
    'social.inbox.sync.youtube-comments',
    'Sync YouTube Comments',
    'Ingests tenant-scoped YouTube comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.instagram-comments',
    'Sync Instagram Comments',
    'Ingests tenant-scoped Instagram comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.instagram-dms',
    'Sync Instagram DMs',
    'Ingests tenant-scoped Instagram direct messages into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.x-comments',
    'Sync X Comments',
    'Ingests tenant-scoped X replies into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.x-dms',
    'Sync X DMs',
    'Ingests tenant-scoped X direct messages into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.linkedin-comments',
    'Sync LinkedIn Comments',
    'Ingests tenant-scoped LinkedIn comments into the social inbox.',
  ),
  internalAction(
    'social.inbox.sync.linkedin-dms',
    'Sync LinkedIn DMs',
    'Ingests tenant-scoped LinkedIn direct messages into the social inbox.',
  ),
  internalAction(
    'scheduled-post.claim',
    'Claim Scheduled Post',
    'Claims the immutable approval and validates the scheduled post scope.',
  ),
  internalAction(
    'scheduled-post.deliver',
    'Deliver Scheduled Post',
    'Publishes one claimed post through its connected brand account.',
  ),
  internalAction(
    'scheduled-post.fail',
    'Fail Scheduled Post',
    'Projects a terminal pre-delivery workflow failure onto one post.',
  ),
  internalAction(
    'scheduled-post.finalize',
    'Finalize Scheduled Post',
    'Finalizes approval, activity, and recurrence state after delivery.',
  ),
  internalAction(
    'social.reply-campaign.load',
    'Load Social Reply Campaign',
    'Loads and validates one social reply campaign tick.',
  ),
  internalAction(
    'social.reply-campaign.reclaim',
    'Reclaim Social Reply Campaign Recipient',
    'Reclaims stale in-progress recipients for one social reply campaign.',
  ),
  internalAction(
    'social.reply-campaign.throttle',
    'Throttle Social Reply Campaign',
    'Evaluates the durable pacing window for one social reply campaign.',
  ),
  internalAction(
    'social.reply-campaign.claim',
    'Claim Social Reply Campaign Recipient',
    'Claims one pending recipient for a social reply campaign tick.',
  ),
  internalAction(
    'social.reply-campaign.prepare',
    'Prepare Social Reply Campaign Message',
    'Prepares one claimed social reply campaign message for delivery.',
  ),
  internalAction(
    'social.reply-campaign.finalize',
    'Finalize Social Reply Campaign Tick',
    'Finalizes one social reply campaign recipient and campaign state.',
  ),
  internalAction(
    'twitter.pipeline.search-recent',
    'Search Recent X Posts',
    'Searches recent X posts through a scoped connected account.',
  ),
  internalAction(
    'twitter.pipeline.draft.build-prompt',
    'Build X Draft Prompt',
    'Builds the strategy prompt for X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.draft.generate',
    'Generate X Drafts',
    'Generates candidate X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.draft.parse',
    'Parse X Drafts',
    'Parses and validates generated X opportunity drafts.',
  ),
  internalAction(
    'twitter.pipeline.publish.resolve-credential',
    'Resolve X Publish Credential',
    'Resolves the scoped connected account for X publication.',
  ),
  internalAction(
    'twitter.pipeline.publish.send',
    'Send X Publication',
    'Publishes one validated X post through its connected account.',
  ),
  internalAction(
    'skill.content-geo-optimizer.execute',
    'Execute Content GEO Optimizer Skill',
    'Executes one workflow-backed content GEO optimization skill operation.',
    { authorization: 'user' },
  ),
  internalAction(
    'skill.content-writing.execute',
    'Execute Content Writing Skill',
    'Executes one workflow-backed content writing skill operation.',
    { authorization: 'user' },
  ),
  internalAction(
    'skill.image-generation.execute',
    'Execute Image Generation Skill',
    'Executes one workflow-backed image generation skill operation.',
    { authorization: 'user' },
  ),
  internalAction(
    'skill.trend-discovery.execute',
    'Execute Trend Discovery Skill',
    'Executes one workflow-backed trend discovery skill operation.',
    { authorization: 'user' },
  ),
  internalAction(
    'skill.trend-remix.execute',
    'Execute Trend Remix Skill',
    'Executes one workflow-backed trend remix skill operation.',
    { authorization: 'user' },
  ),
  internalAction(
    'voice.generate.execute',
    'Generate Voice',
    'Generates and persists one text-to-speech audio ingredient.',
  ),
  internalAction(
    'youtube.clip.create-session',
    'Create Public Clip Session',
    'Creates or reuses one idempotent public YouTube clip session.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.dispatch-preview',
    'Dispatch Public Clip Preview',
    'Dispatches one reserved clip preview render.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.read-session',
    'Read Public Clip Session',
    'Reads one public clip session and reconciles its preview state.',
    { authorization: 'public', idempotency: 'none', visibility: 'public' },
  ),
  internalAction(
    'youtube.clip.release-session',
    'Release Public Clip Session',
    'Compensates a newly created public clip session after downstream workflow failure.',
    { authorization: 'public' },
  ),
  internalAction(
    'youtube.clip.reserve-preview',
    'Reserve Public Clip Preview',
    'Reserves one clip recommendation for preview rendering.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'youtube.create-source-library-asset',
    'Save YouTube Source to Library',
    'Promotes one trusted temporary YouTube source into a durable Library asset.',
    { authorization: 'user' },
  ),
  internalAction(
    'youtube.extract-audio',
    'Extract YouTube Audio',
    'Downloads one resolved YouTube source and extracts its temporary audio.',
    { authorization: 'public' },
  ),
  internalAction(
    'youtube.plan-source-library-asset',
    'Plan YouTube Source Library Asset',
    'Validates one retained YouTube source and derives its deterministic Library identity.',
    { authorization: 'user' },
  ),
  internalAction(
    'youtube.transcribe-audio',
    'Transcribe YouTube Audio',
    'Transcribes one temporary YouTube audio artifact.',
    { authorization: 'public', credits: { mode: 'dynamic' } },
  ),
  internalAction(
    'youtube.resolve-source',
    'Resolve YouTube Source',
    'Validates and resolves one public YouTube source.',
    { authorization: 'public', visibility: 'public' },
  ),
  internalAction(
    'email-digest.prepare',
    'Prepare Email Digest',
    'Loads and summarizes the scoped content for one email digest.',
  ),
  internalAction(
    'email-digest.discover-recipients',
    'Discover Email Digest Recipients',
    'Discovers the bounded recipients for one prepared email digest.',
  ),
  internalAction(
    'email-digest.render',
    'Render Email Digest',
    'Renders one prepared email digest for delivery.',
  ),
  internalAction(
    'email-digest.deliver-recipient',
    'Deliver Email Digest Recipient',
    'Delivers one rendered digest to one recipient.',
  ),
  internalAction(
    'email-digest.finalize',
    'Finalize Email Digest',
    'Finalizes one email digest after all recipient workflows settle.',
  ),
  internalAction(
    'agent-campaign.memory.load-winners',
    'Load Agent Campaign Winners',
    'Loads bounded winning campaign evidence for memory extraction.',
  ),
  internalAction(
    'agent-campaign.memory.persist',
    'Persist Agent Campaign Memory',
    'Persists extracted campaign memory for one tenant campaign.',
  ),
  internalAction(
    'agent-campaign.orchestration.discover-due',
    'Discover Due Agent Campaigns',
    'Discovers bounded campaign orchestrations due for execution.',
  ),
  internalAction(
    'agent-campaign.orchestration.load-context',
    'Load Agent Campaign Context',
    'Loads tenant-scoped context for one campaign orchestration.',
  ),
  internalAction(
    'agent-campaign.orchestration.plan',
    'Plan Agent Campaign Runs',
    'Builds bounded run dispatches for one campaign orchestration.',
  ),
  internalAction(
    'agent-campaign.orchestration.dispatch-run',
    'Dispatch Agent Campaign Run',
    'Dispatches one planned campaign agent run.',
  ),
  internalAction(
    'agent-campaign.orchestration.summarize',
    'Summarize Agent Campaign Runs',
    'Summarizes completed run outcomes for one campaign orchestration.',
  ),
  internalAction(
    'agent-campaign.orchestration.capture-memory',
    'Capture Agent Campaign Memory',
    'Builds memory extraction inputs from one campaign orchestration.',
  ),
  internalAction(
    'agent-campaign.orchestration.annotate-run',
    'Annotate Agent Campaign Run',
    'Annotates one campaign run with orchestration provenance.',
  ),
  internalAction(
    'agent-campaign.orchestration.finalize',
    'Finalize Agent Campaign Orchestration',
    'Finalizes one campaign orchestration cycle.',
  ),
  internalAction(
    'agent-campaign.triggers.discover-due',
    'Discover Due Agent Campaign Triggers',
    'Discovers bounded campaign triggers due for evaluation.',
  ),
  internalAction(
    'agent-campaign.triggers.load-context',
    'Load Agent Campaign Trigger Context',
    'Loads tenant-scoped context for one campaign trigger evaluation.',
  ),
  internalAction(
    'agent-campaign.triggers.plan-recommendations',
    'Plan Agent Campaign Recommendations',
    'Builds bounded recommendations from one trigger evaluation.',
  ),
  internalAction(
    'agent-campaign.triggers.persist-recommendation',
    'Persist Agent Campaign Recommendation',
    'Persists one campaign trigger recommendation.',
  ),
  internalAction(
    'agent-campaign.triggers.plan-groups',
    'Plan Agent Campaign Trigger Groups',
    'Builds bounded trigger dispatch groups.',
  ),
  internalAction(
    'agent-campaign.triggers.plan-dispatches',
    'Plan Agent Campaign Trigger Dispatches',
    'Builds bounded run dispatches for one trigger group.',
  ),
  internalAction(
    'agent-campaign.triggers.dispatch-run',
    'Dispatch Agent Campaign Trigger Run',
    'Dispatches one planned trigger agent run.',
  ),
  internalAction(
    'agent-campaign.triggers.annotate-run',
    'Annotate Agent Campaign Trigger Run',
    'Annotates one trigger run with workflow provenance.',
  ),
  internalAction(
    'agent-campaign.triggers.finalize-group',
    'Finalize Agent Campaign Trigger Group',
    'Finalizes one trigger dispatch group.',
  ),
  internalAction(
    'agent-campaign.triggers.finalize',
    'Finalize Agent Campaign Trigger Evaluation',
    'Finalizes one campaign trigger evaluation.',
  ),
  internalAction(
    'batch.generation.mark-queued',
    'Mark Batch Generation Queued',
    'Claims one batch generation request for workflow execution.',
  ),
  internalAction(
    'batch.generation.process',
    'Process Batch Generation',
    'Generates one claimed batch through the shared generation service.',
  ),
  internalAction(
    'batch.generation.settle',
    'Settle Batch Generation',
    'Finalizes credits and durable state for one batch generation run.',
  ),
  internalAction(
    'insight.load-generation-context',
    'Load Insight Generation Context',
    'Loads the tenant context required to generate insights.',
  ),
  internalAction(
    'insight.generate-drafts',
    'Generate Insight Drafts',
    'Generates structured insight drafts from loaded tenant context.',
  ),
  internalAction(
    'insight.persist-generated',
    'Persist Generated Insights',
    'Persists one bounded set of generated tenant insights.',
  ),
  internalAction(
    'knowledge.source.discover-backfill',
    'Discover Knowledge Source Backfill',
    'Discovers bounded knowledge sources that require ingestion.',
  ),
  internalAction(
    'knowledge.source.load',
    'Load Knowledge Source',
    'Loads one tenant-scoped knowledge source for ingestion.',
  ),
  internalAction(
    'knowledge.source.mark-processing',
    'Mark Knowledge Source Processing',
    'Claims one knowledge source for ingestion.',
  ),
  internalAction(
    'knowledge.source.extract',
    'Extract Knowledge Source',
    'Extracts canonical text from one claimed knowledge source.',
  ),
  internalAction(
    'knowledge.source.chunk',
    'Chunk Knowledge Source',
    'Creates bounded searchable chunks from extracted source text.',
  ),
  internalAction(
    'knowledge.source.replace-chunks',
    'Replace Knowledge Source Chunks',
    'Atomically replaces stored chunks for one knowledge source.',
  ),
  internalAction(
    'knowledge.source.finalize',
    'Finalize Knowledge Source',
    'Finalizes one knowledge-source ingestion workflow.',
  ),
  internalAction(
    'lifecycle-email.load-delivery',
    'Load Lifecycle Email Delivery',
    'Loads one scheduled lifecycle-email delivery and its tenant context.',
  ),
  internalAction(
    'lifecycle-email.check-eligibility',
    'Check Lifecycle Email Eligibility',
    'Evaluates whether one lifecycle-email delivery remains eligible.',
  ),
  internalAction(
    'lifecycle-email.render',
    'Render Lifecycle Email',
    'Renders one eligible lifecycle email.',
  ),
  internalAction(
    'lifecycle-email.deliver',
    'Deliver Lifecycle Email',
    'Delivers one rendered lifecycle email.',
  ),
  internalAction(
    'lifecycle-email.finalize',
    'Finalize Lifecycle Email',
    'Finalizes one lifecycle-email delivery workflow.',
  ),
  internalAction(
    'lifecycle-email.scheduling.plan',
    'Plan Lifecycle Email Scheduling',
    'Plans the bounded delivery transitions for one lifecycle event.',
  ),
  internalAction(
    'lifecycle-email.scheduling.persist-delivery',
    'Persist Lifecycle Email Delivery',
    'Persists one planned lifecycle-email delivery idempotently.',
  ),
  internalAction(
    'lifecycle-email.scheduling.enqueue-delivery',
    'Enqueue Lifecycle Email Delivery',
    'Enqueues one persisted lifecycle-email delivery workflow.',
  ),
  internalAction(
    'lifecycle-email.scheduling.cancel-checkout',
    'Cancel Lifecycle Checkout Emails',
    'Cancels pending checkout lifecycle emails after conversion.',
  ),
  internalAction(
    'lifecycle-email.scheduling.finalize',
    'Finalize Lifecycle Email Scheduling',
    'Finalizes one lifecycle-email scheduling workflow.',
  ),
  internalAction(
    'signup.prefill.prepare',
    'Prepare Signup Prefill',
    'Loads and validates one signup-prefill request.',
  ),
  internalAction(
    'signup.prefill.scrape',
    'Scrape Signup Prefill Source',
    'Scrapes bounded public context for one signup prefill.',
  ),
  internalAction(
    'signup.prefill.analyze',
    'Analyze Signup Prefill',
    'Analyzes scraped signup context into structured defaults.',
  ),
  internalAction(
    'signup.prefill.apply-defaults',
    'Apply Signup Prefill Defaults',
    'Applies deterministic defaults to one analyzed signup prefill.',
  ),
  internalAction(
    'signup.prefill.apply-prompt',
    'Apply Signup Prefill Prompt',
    'Persists the generated onboarding prompt for one signup prefill.',
  ),
  internalAction(
    'signup.prefill.seed-harness',
    'Seed Signup Prefill Harness',
    'Seeds the evaluation harness for one signup prefill.',
  ),
  internalAction(
    'signup.prefill.finalize',
    'Finalize Signup Prefill',
    'Finalizes one successfully generated signup prefill.',
  ),
  internalAction(
    'signup.prefill.fail',
    'Fail Signup Prefill',
    'Projects one terminal signup-prefill workflow failure.',
  ),
  internalAction(
    'telegram.distribution.claim',
    'Claim Telegram Distribution',
    'Claims one Telegram distribution request for workflow execution.',
  ),
  internalAction(
    'telegram.distribution.resolve-credential',
    'Resolve Telegram Credential',
    'Resolves the scoped credential for one Telegram distribution.',
  ),
  internalAction(
    'telegram.distribution.send',
    'Send Telegram Distribution',
    'Sends one claimed Telegram distribution through its resolved credential.',
  ),
  internalAction(
    'telegram.distribution.finalize',
    'Finalize Telegram Distribution',
    'Finalizes one Telegram distribution workflow.',
  ),
  internalAction(
    'workspace.task.route',
    'Route Workspace Task',
    'Routes one workspace task to its explicit execution child workflow.',
  ),
  internalAction(
    'workspace.task.finalize',
    'Finalize Workspace Task',
    'Finalizes one workspace task after its child workflow settles.',
  ),
  internalAction(
    'workspace.task.agent.decompose',
    'Decompose Workspace Agent Task',
    'Decomposes one workspace task into bounded agent subtasks.',
  ),
  internalAction(
    'workspace.task.agent.plan-executions',
    'Plan Workspace Agent Executions',
    'Plans one bounded set of child agent workflow executions for a workspace task.',
  ),
  internalAction(
    'workspace.task.agent.enqueue-execution',
    'Enqueue Workspace Agent Execution',
    'Enqueues one agent-turn workflow execution for a workspace task subtask.',
  ),
  internalAction(
    'workspace.task.agent.link-executions',
    'Link Workspace Agent Executions',
    'Links settled child workflow executions to one workspace task.',
  ),
  internalAction(
    'workspace.task.facecam.prepare',
    'Prepare Workspace Facecam Task',
    'Builds one validated facecam request for a workspace task.',
  ),
  internalAction(
    'workspace.task.facecam.record-start',
    'Record Workspace Facecam Start',
    'Records the start of one workspace facecam generation.',
  ),
  internalAction(
    'workspace.task.facecam.generate',
    'Generate Workspace Facecam',
    'Dispatches one workspace facecam generation request.',
  ),
  internalAction(
    'workspace.task.facecam.finalize',
    'Finalize Workspace Facecam',
    'Attaches a continued provider result and records facecam completion atomically.',
  ),
  internalAction(
    'workspace.task.facecam.finalize-failure',
    'Finalize Failed Workspace Facecam',
    'Records one terminal workspace facecam provider failure.',
  ),
  internalAction(
    'workflow.artifact.cleanup',
    'Clean Up Workflow Artifacts',
    'Deletes temporary storage objects owned by one workflow execution.',
  ),
  internalAction(
    'workflow.artifact.promote',
    'Promote Workflow Artifact',
    'Marks one temporary workflow artifact as retained by a durable Library record.',
    { authorization: 'user' },
  ),
  internalAction(
    'workflow.artifact.register',
    'Register Workflow Artifact',
    'Registers one temporary workflow storage object for terminal and TTL cleanup.',
    { authorization: 'public' },
  ),
  internalAction(
    'workflow.for-each',
    'Run Workflow for Each Item',
    'Runs or durably schedules one registered child workflow for each item in a bounded collection.',
  ),
  internalAction(
    'workflow.for-each-dynamic',
    'Run Dynamically Selected Workflows',
    'Runs action-selected, immutable-version child workflows with deterministic parent linkage.',
  ),
  internalAction(
    'workflow.for-each-tenant',
    'Run Workflow for Each Tenant',
    'Runs a registered child workflow in each validated tenant context discovered by a hidden system workflow.',
  ),
  internalAction(
    'workflow.run-child',
    'Run Child Workflow',
    'Runs one registered child workflow with mapped inputs in the current tenant context.',
  ),
  internalAction(
    'workflow.collect-output',
    'Collect Workflow Output',
    'Collects terminal workflow inputs into one structured result.',
    { authorization: 'user' },
  ),
];

const definitions = [...ALL_TOOLS.map(toolAction), ...INTERNAL_ACTIONS];
const duplicateIds = definitions
  .map((definition) => definition.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length > 0) {
  throw new Error(
    `Duplicate Genfeed action definitions: ${[...new Set(duplicateIds)].join(', ')}`,
  );
}

const workflowActionsMissingPresentation = definitions.filter(
  (definition) =>
    definition.visibility === 'workflow' &&
    (!definition.workflowCategory || !definition.workflowIcon),
);

if (workflowActionsMissingPresentation.length > 0) {
  throw new Error(
    `Workflow actions missing presentation metadata: ${workflowActionsMissingPresentation
      .map((definition) => definition.id)
      .join(', ')}`,
  );
}

export const ALL_ACTIONS: readonly GenfeedActionDefinition[] = definitions;

const ACTIONS_BY_ID = new Map(
  ALL_ACTIONS.map((definition) => [definition.id, definition]),
);

export function getActionDefinition(
  actionId: string,
): GenfeedActionDefinition | undefined {
  return ACTIONS_BY_ID.get(actionId);
}

export function createGenfeedActionNode(
  input: CreateGenfeedActionNodeInput,
): GenfeedActionNodeDefinition {
  const action = getActionDefinition(input.actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action: ${input.actionId}`);
  }
  return {
    data: {
      config: { actionId: action.id, parameters: input.parameters ?? {} },
      inputVariableKeys: input.inputVariableKeys ?? [],
      label: input.label ?? action.label,
    },
    id: input.id,
    position: input.position ?? { x: 0, y: 120 },
    type: 'genfeedAction',
  };
}
