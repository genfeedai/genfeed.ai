/**
 * Every generation type the product ships, and what carries the org + brand
 * context into its prompt. The matching test reads each source file and fails
 * if a marker is missing, if an enum member has no row, or if a documented gap
 * quietly gets fixed without the row being promoted.
 *
 * Mirrors `generation-brief-entry-points.ts` (#3469), which does the same for
 * image and video brief compilation.
 */

export const BRAND_CONTEXT_PATHS = [
  /** Harness brief (org + brand pack, profile, Brand OS, memory) in the prompt. */
  'harness',
  /** Generation-brief compiler: brand kit and harness brief compiled per model. */
  'generation-brief',
  /** Brand voice summary only: no harness packs, anti-examples or criteria. */
  'brand-voice-summary',
  /** No brand or org context reaches the prompt. */
  'none',
  /** Not a generator: upload, edit, transform or an enum value with no producer. */
  'exempt',
] as const;
export type BrandContextPath = (typeof BRAND_CONTEXT_PATHS)[number];

export const SMOKE_MEDIUMS = ['text', 'image', 'video'] as const;
export type SmokeMedium = (typeof SMOKE_MEDIUMS)[number];

export interface GenerationTypeEnumRefs {
  ContentType?: readonly string[];
  GenerationType?: readonly string[];
  IngredientCategory?: readonly string[];
}

export interface GenerationTypeEntry {
  /** Stable id; text kinds double as the smoke fixture `contentKind`. */
  id: string;
  enumRefs: GenerationTypeEnumRefs;
  path: BrandContextPath;
  /** Repo-relative file that must contain `marker` (harness / brief paths). */
  source?: string;
  marker?: string;
  /** Smoke medium that exercises this type; null when nothing generates it. */
  smoke: SmokeMedium | null;
  /** Why the path is `exempt`, or what the gap is (and how it is tracked). */
  note?: string;
}

const API = 'apps/server/api/src';

export const GENERATION_TYPES: readonly GenerationTypeEntry[] = [
  {
    enumRefs: {
      ContentType: ['CAPTION'],
      GenerationType: ['POST'],
    },
    id: 'social-post',
    marker: 'resolveSnapshotBriefWithRecipe',
    path: 'harness',
    smoke: 'text',
    source: `${API}/services/branded-text-generation/branded-text-generation.service.ts`,
  },
  {
    enumRefs: { GenerationType: ['THREAD'] },
    id: 'thread',
    marker: 'generateThread',
    path: 'harness',
    smoke: 'text',
    source: `${API}/services/branded-text-generation/branded-text-generation.service.ts`,
  },
  {
    enumRefs: { ContentType: ['ARTICLE'], GenerationType: ['BLOG'] },
    id: 'article',
    marker: 'composeBrief',
    path: 'harness',
    smoke: 'text',
    source: `${API}/collections/articles/services/articles-content.service.ts`,
  },
  {
    enumRefs: {},
    id: 'linkedin-article',
    marker: 'composeBrief',
    note: 'ArticleCategory.LINKEDIN_ARTICLE shares the article generator.',
    path: 'harness',
    smoke: 'text',
    source: `${API}/collections/articles/services/articles-content.service.ts`,
  },
  {
    enumRefs: {},
    id: 'linkedin-post',
    marker: 'resolveBrief',
    note: 'Platform variant of the content-intelligence generator.',
    path: 'harness',
    smoke: 'text',
    source: `${API}/collections/content-intelligence/services/content-generator.service.ts`,
  },
  {
    enumRefs: {},
    id: 'reply',
    marker: 'resolveBrief',
    path: 'harness',
    smoke: 'text',
    source: `${API}/services/reply-bot/reply-generation.service.ts`,
  },
  {
    enumRefs: {},
    id: 'ad-copy',
    marker: 'resolveBrief',
    path: 'harness',
    smoke: 'text',
    source: `${API}/endpoints/ads-research/ads-research.service.ts`,
  },
  {
    enumRefs: { ContentType: ['SCRIPT'] },
    id: 'script',
    marker: 'buildSystemPrompt',
    note: 'GAP: no dedicated generator. The agent-chat model writes the script work object under a system prompt from AgentContextAssemblyService, which carries brand identity, guidance, memory and recent posts but never composes the harness brief (org directive, guardrails, criteria, anti-examples). Tracked in #7868. Promote to `harness` when the chat script path calls resolveBrief.',
    path: 'brand-voice-summary',
    smoke: 'text',
    source: `${API}/services/agent-context-assembly/agent-context-assembly.service.ts`,
  },
  {
    enumRefs: { GenerationType: ['NEWSLETTER'] },
    id: 'newsletter',
    marker: 'resolveBrief',
    note: 'Drafts compose the harness brief in loadDraftGenerationContext and fail with a retryable 503 when it or the provider is unavailable; there is no template fallback.',
    path: 'harness',
    smoke: 'text',
    source: `${API}/collections/newsletters/services/newsletters.service.ts`,
  },
  {
    enumRefs: { ContentType: ['IMAGE'], GenerationType: ['IMAGE'] },
    id: 'image',
    marker: 'runImageGenerationBrief',
    path: 'generation-brief',
    smoke: 'image',
    source: `${API}/collections/images/services/image-generation.service.ts`,
  },
  {
    enumRefs: {
      ContentType: ['VIDEO'],
      GenerationType: ['VIDEO'],
    },
    id: 'video',
    marker: 'runVideoGenerationBrief',
    path: 'generation-brief',
    smoke: 'video',
    source: `${API}/collections/videos/services/video-generation-brief.util.ts`,
  },
  {
    enumRefs: { IngredientCategory: ['IMAGE', 'VIDEO'] },
    id: 'studio-media-ingredients',
    note: 'IngredientCategory.IMAGE/VIDEO are the stored output of the image and video rows above.',
    path: 'exempt',
    smoke: null,
  },
  {
    enumRefs: { IngredientCategory: ['MUSIC'] },
    id: 'music',
    marker: 'resolveBrief',
    note: 'Approved brand guidance and voice are advisory music context resolved on the media harness surface; deterministic fixtures cover propagation without live audio generation.',
    path: 'harness',
    smoke: null,
    source: `${API}/collections/musics/services/music-generation.service.ts`,
  },
  {
    enumRefs: { IngredientCategory: ['AVATAR'] },
    id: 'avatar-video',
    marker: 'inputText: params.text',
    note: 'GAP: the render sends the caller text to the provider verbatim, and brand context only picks the avatar and voice identity. The spoken script comes from agent chat, the aiAvatarVideo workflow node, turbo ideas or the facecam task, none of which compose the harness brief. Tracked in #7868. Promote to `harness` once the script is authored from a composed brief.',
    path: 'none',
    smoke: null,
    source: `${API}/collections/videos/services/avatar-video-generation.service.ts`,
  },
  {
    enumRefs: { GenerationType: ['CLIP'] },
    id: 'clip',
    note: 'Cuts an existing video; the clip prompt is not generative.',
    path: 'exempt',
    smoke: null,
  },
  {
    enumRefs: { IngredientCategory: ['GIF', 'IMAGE_EDIT', 'VIDEO_EDIT'] },
    id: 'derived-media',
    note: 'Edits or conversions of an existing asset; brand context was applied when the source was generated.',
    path: 'exempt',
    smoke: null,
  },
  {
    enumRefs: { IngredientCategory: ['AUDIO', 'VOICE'] },
    id: 'voice-audio',
    note: 'Text-to-speech and uploads are exempt non-generative transforms (see GENERATION_BRIEF_ENTRY_EXEMPTIONS).',
    path: 'exempt',
    smoke: null,
  },
  {
    enumRefs: { IngredientCategory: ['INGREDIENT', 'TEXT', 'SOURCE'] },
    id: 'container-categories',
    note: 'Storage categories for references, text blobs and imported sources; nothing is generated under them.',
    path: 'exempt',
    smoke: null,
  },
  {
    enumRefs: { GenerationType: ['PODCAST'] },
    id: 'podcast',
    note: 'Enum value with no generator in the codebase today.',
    path: 'exempt',
    smoke: null,
  },
];

/** Text kinds the smoke fixture must cover, derived so the two cannot drift. */
export const SMOKE_TEXT_KINDS: readonly string[] = GENERATION_TYPES.filter(
  (entry) => entry.smoke === 'text',
).map((entry) => entry.id);
