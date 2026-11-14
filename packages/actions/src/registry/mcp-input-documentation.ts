import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';

// Exact reviewed wording only: a changed parameter description falls back
// unchanged. Tool-level MCP wording lives beside each tool as `mcpDescription`.

const PARAMETER_DOCUMENTATION = new Map([
  [
    'Brand that owns this generation. Required on MCP: call get_brands and pass one of its ids. A call without it is rejected with the list of your brands.',
    'Owning brand ID from get_brands. Required; omission rejects with your brand list.',
  ],
  [
    "Optional ID of the brand's connected Instagram account to read as. Otherwise the brand's first connected account is used.",
    "Connected Instagram account ID; defaults to brand's first.",
  ],
  [
    'Optional organization-owned brand ID. Otherwise the selected brand is used.',
    'Organization-owned brand ID; defaults to selected brand.',
  ],
  [
    'ID of the connected TikTok Ads credential',
    'Connected TikTok Ads credential ID.',
  ],
  ['Social conversation id', 'Conversation ID.'],
  [
    'Brand to attach the account to. Required when the organization has more than one brand.',
    'Account brand ID; required with multiple organization brands.',
  ],
  [
    'Ad account ID: Meta act_ ID, Google Ads customer ID, or TikTok advertiser ID',
    'Meta act_ / Google Ads customer / TikTok advertiser ID.',
  ],
  [
    'Identifier of the selected public ad or ad from a connected account.',
    'Selected public/connected ad ID.',
  ],
  [
    'Whether the ad is public research or from a connected account.',
    'Public research or connected-account ad.',
  ],
  [
    'The interview session ID returned by start_brand_interview.',
    'interviewId from start_brand_interview.',
  ],
  ['Optional workflow run id for provenance', 'Provenance workflow run ID.'],
  [
    'Custom range start date (YYYY-MM-DD), used with until',
    'Range start YYYY-MM-DD; pair with until.',
  ],
  [
    'Custom range end date (YYYY-MM-DD), used with since',
    'Range end YYYY-MM-DD; pair with since.',
  ],
  [
    'Optional Google manager login customer ID.',
    'Google manager login customer ID.',
  ],
  ['Connected ad account ID for a my-account ad.', 'my-account ad account ID.'],
  ['Connected credential ID for a my-account ad.', 'my-account credential ID.'],
  ['Optional platform hint for connected ads.', 'Connected-ads platform hint.'],
  ['Start date (YYYY-MM-DD)', 'Start YYYY-MM-DD.'],
  ['End date (YYYY-MM-DD)', 'End YYYY-MM-DD.'],
  [
    'Manager account customer ID (required when accessing client accounts via manager)',
    'Manager customer ID; required for managed client accounts.',
  ],
  [
    'Minimum virality score threshold (0-100)',
    'Minimum virality score, 0-100.',
  ],
  ['Maximum number of search results (1-50).', 'Result limit, 1-50.'],
  [
    'Exact tool name to describe. Takes precedence over query and toolset.',
    'Exact name; overrides query/toolset.',
  ],
  [
    'Case-insensitive substring to match against tool name, description, or toolset.',
    'Case-insensitive name/description/toolset substring.',
  ],
  [
    'What to generate. For voice, the exact text to speak. For music, the style, mood, instruments and genre.',
    'Generation brief; voice: exact spoken text; music: style/mood/instruments/genre.',
  ],
  [
    'Image, video or music only. Exact models[].key from get_generation_options for that type. Omit for the router. Do not invent aliases; an unknown key is rejected.',
    'Image/video/music: exact get_generation_options models[].key for type; omit for routing. Unknown aliases reject.',
  ],
  [
    'Image or video only. For example 1:1, 16:9 or 9:16.',
    'Image/video ratio, e.g. 1:1, 16:9, 9:16.',
  ],
  [
    'Image or video only. Use a resolution the chosen model accepts. black-forest-labs/flux-3-image accepts 768sq, 1k (default), 1.5k, 2k or 4k. Video values are model-native, for example 720p, 1080p or 4k; unsupported values are rejected.',
    'Image/video: model-supported resolution. black-forest-labs/flux-3-image: 768sq, 1k (default), 1.5k, 2k, 4k. Video: native values, e.g. 720p/1080p/4k. Unsupported values reject.',
  ],
  [
    'Video or music only. Seconds; video models clamp or reject out-of-range values, music accepts 10-300.',
    'Video/music seconds; video clamps/rejects out-of-range, music 10-300.',
  ],
  ['Image only. Number of variants.', 'Image variant count.'],
  [
    'Image or video only. Asset/ingredient ids or URLs used as character or style references, not the start frame. Max 10 for images, 8 for video.',
    'Image/video character/style reference IDs or URLs, not start frame. Max image 10, video 8.',
  ],
  [
    'Image or video only. Brand character handles resolved into reference images. Max 4; unresolvable handles fail the call.',
    'Image/video brand handles to reference images; max 4, unresolved handles fail.',
  ],
  [
    'Video only. Start frame for image-to-video: the Library image id (from a generated image, get_assets, or a handed-off ingredient record). With audioUrl, talking-avatar lip-sync.',
    'Video start-frame Library image id; with audioUrl enables avatar lip-sync.',
  ],
  [
    'Video only. Audio URL for avatar lip-sync together with imageUrl.',
    'Video avatar lip-sync audio URL; requires imageUrl.',
  ],
  [
    'Video only. Image ingredient id for the final frame.',
    'Video final-frame image ingredient ID.',
  ],
  [
    'Video only. Video ingredient ids for models supporting video references.',
    'Video-reference ingredient IDs; supported models only.',
  ],
  [
    'Voice only. Catalog or cloned voice id; omit when unknown.',
    'Voice catalog/clone ID; omit if unknown.',
  ],
  [
    'Image or video only. Override saved prompt enhancement for this generation. False preserves the prompt text exactly.',
    'Image/video enhancement override; false preserves exact prompt text.',
  ],
  [
    "Image or video only. Pass 'raw' only after the user explicitly chose to generate without brand: the prompt goes to the provider exactly as typed and no brand identity applies. Never set it on your own after a brand enhancement failure.",
    'Image/video: raw sends exact prompt without brand identity. Only after explicit user choice; never as fallback after brand enhancement failure.',
  ],
  [
    'Image or video only. Explicit skill selections for this generation; additive to brand guidance.',
    'Image/video explicit skills; add to brand guidance.',
  ],
  [
    'Image or video only. Transient task context for this generation. Not saved as Knowledge.',
    'Image/video task-only context; never saved as Knowledge.',
  ],
  [
    'Must stay false. Persistent save is a separate action.',
    'Must be false; persistence is a separate action.',
  ],
  [
    'Authorized Knowledge source ids to apply to this task.',
    'Authorized task Knowledge source IDs.',
  ],
  [
    'Task-only context text. Max 8000 characters.',
    'Task-only text; max 8000 characters.',
  ],
  [
    'edit, reframe. ID of the existing Library image to transform.',
    'edit/reframe: Library image ID.',
  ],
  ['upscale. URL of the image to upscale.', 'upscale: source image URL.'],
  [
    'edit. Exact editing instruction. Required for edit.',
    'edit: required exact instruction.',
  ],
  [
    'edit. Exact image-edit key from get_generation_options models. Omit for the image-editing category default.',
    'edit: get_generation_options image-edit key; omit for image-editing default.',
  ],
  [
    'edit. Mask image ID matching the primary dimensions: black changes, white stays.',
    'edit: mask ID matching primary dimensions; black changes, white stays.',
  ],
  [
    'merge. Ordered video ingredient ids to join (at least two). Required for merge.',
    'merge: required ordered video ingredient IDs, at least 2.',
  ],
  [
    'merge. Burn transcribed captions into the merged video.',
    'merge: burn transcribed captions.',
  ],
  [
    'merge. Mute the original audio from the source clips.',
    'merge: mute source audio.',
  ],
  [
    'merge. Fit the joined video to portrait 1080x1920 after merge.',
    'merge: resize to portrait 1080x1920.',
  ],
  [
    'merge. Music ingredient id to lay under the merged video.',
    'merge: background music ingredient ID.',
  ],
  [
    'merge. Background music volume from 0 to 100.',
    'merge: music volume, 0-100.',
  ],
  [
    'merge. Transition between clips. Defaults to a cut when omitted.',
    'merge: transition; omitted means cut.',
  ],
  [
    'merge. Transition length in seconds (0.1-2).',
    'merge: transition seconds, 0.1-2.',
  ],
  [
    'Social types. Only together with knowledgeSourceIds: a receipt-backed draft cannot be grounded on purposes alone (BRAND_TRUTH, INSPIRATION, RESEARCH)',
    'Social: requires knowledgeSourceIds; purposes alone cannot ground receipt-backed drafts.',
  ],
  [
    'Social types. Ground the content on these saved Knowledge source ids only; the brand receipt records them',
    'Social: ground only on these saved Knowledge IDs; recorded in brand receipt.',
  ],
  [
    'article, x-article. Writing tone, for example professional, casual, humorous, technical or storytelling',
    'article/x-article: tone, e.g. professional/casual/humorous/technical/storytelling.',
  ],
  [
    'All types. Topic or brief for the content (at most 500 characters for article and x-article)',
    'Topic/brief; article/x-article max 500 characters.',
  ],
  [
    'Social types. Number of variations to generate (1-5, default 1)',
    'Social: variations, 1-5; default 1.',
  ],
  [
    'article. Article length, folded into the generation prompt',
    'article: prompt length guidance.',
  ],
  [
    'article. Target audience, folded into the generation prompt',
    'article: prompt audience guidance.',
  ],
  [
    'Limit models to this type and return a credit estimate and balance. Omit to list every callable image, image-edit, video, voice and music model and read settings only.',
    'Filter type plus cost/balance; omit for all callable models and settings only.',
  ],
  [
    'Cost only. Exact models key for this type. Omit or pass Auto: image and video stay unpriced until a model is selected; music quotes the registry default. An unknown alias returns MODEL_UNAVAILABLE.',
    'Cost: exact type model key. Omit/Auto: image/video unpriced, music registry default. Unknown alias: MODEL_UNAVAILABLE.',
  ],
  [
    'Cost only, video. Price the clip with audio on; defaults to off, as Studio submits it.',
    'Video cost: enable audio; default off (Studio default).',
  ],
  [
    'Only assets with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy). Not used with type character.',
    'Non-character origin: UPLOADED member file, GENERATED Genfeed output, IMPORTED external post/page, UNKNOWN legacy.',
  ],
  [
    'Only assets carrying these tags (at most 25 tag ids, taken from the tags each listed asset returns). Combined by tagMatch. A tag the brand cannot use matches nothing. Not used with type character.',
    'Non-character: max 25 tag IDs from listed assets, combined by tagMatch. Inaccessible tags match nothing.',
  ],
  [
    'Only assets made with these characters (at most 25 ids from type character). Characters the brand cannot use match nothing. Not used with type character.',
    'Non-character: max 25 character IDs from type character. Inaccessible characters match nothing.',
  ],
  [
    'How tags combine: any (default) returns assets with at least one of the tags, all returns assets carrying every one. Not used with type character.',
    'Non-character tags: any matches at least one (default); all requires every tag.',
  ],
  [
    'Only assets on this Library shelf, including unsorted (not filed in a folder). Not used with type character.',
    'Non-character shelf filter; unsorted means no folder.',
  ],
  [
    'Maximum number of assets to return (default 10, max 50). Not used with type character.',
    'Non-character result limit; default 10, max 50.',
  ],
  [
    'Offset for pagination. Not used with type character.',
    'Non-character pagination offset.',
  ],
  [
    'Type character only. Optional handle or label prefix filter.',
    'Character-only handle/label prefix.',
  ],
  [
    'Brand to list. Defaults to the thread brand, then your current brand.',
    'Brand ID; defaults to thread brand, then current brand.',
  ],
  [
    'Return only this brand: its id, slug, name or label. Omit to list all brands in the organization.',
    'Brand id/slug/name/label; omit for all organization brands.',
  ],
  [
    'Include each brand logo URL. Brand cards set this themselves; leave it off otherwise.',
    'Logo URLs; brand cards set this, otherwise omit.',
  ],
  [
    'Return this one post. Use an id from get_posts or a scheduling tool. Cannot be combined with the other fields.',
    'Post ID from get_posts/scheduling; exclusive with all other fields.',
  ],
  [
    'Content calendar mode: number of days ahead to look (for example 7).',
    'Calendar days ahead, e.g. 7.',
  ],
  [
    'List mode only. Filter by canonical target execution state.',
    'List-only target execution state filter.',
  ],
  [
    'Maximum number of posts to return. List mode default 10; calendar mode rows per page, default 50, at most 100.',
    'Result limit: list default 10; calendar rows per page, default 50, max 100.',
  ],
  [
    "Only this brand's posts (list and calendar modes). A brand this connection cannot access is an error.",
    'Only this brand; inaccessible brand errors.',
  ],
  [
    'Calendar mode only. Also list the drafts (draftsCount is always given).',
    'Calendar only: also list drafts.',
  ],
  [
    'Calendar mode only. Page of rows, starting at 1; keep going while hasMore is true.',
    'Calendar page from 1; continue while hasMore.',
  ],
  [
    'Calendar mode only. IANA timezone for the day buckets and gap days (for example Europe/Malta). Default: the timezone most posts were scheduled in, else UTC.',
    'Calendar IANA timezone for days and gaps; default most-used, else UTC.',
  ],
  [
    'Content format distribution (e.g., { imagePercent: 60, videoPercent: 25, carouselPercent: 10, reelPercent: 5, storyPercent: 0 })',
    'Format percentages, e.g. image 60, video 25, carousel 10, reel 5, story 0.',
  ],
  [
    'Scheduling window: dates or ISO 8601 timestamps with UTC offset (e.g., { start: "2026-02-10", end: "2026-02-17" } or { start: "2026-02-10T15:00:00+01:00", end: "2026-02-10T23:00:00+01:00" }). Items are spaced evenly across it, both ends inclusive.',
    'Inclusive start/end dates (YYYY-MM-DD) or ISO 8601 timestamps with UTC offset; evenly spaced items.',
  ],
  [
    'Social media handle to resolve (e.g., "@example_person"). Will auto-resolve to brandId and credential.',
    '@handle to resolve brandId and credential.',
  ],
  [
    'Style direction for generation (e.g., "lifestyle", "professional", "urban")',
    'Style, e.g. lifestyle/professional/urban.',
  ],
  [
    'create_from_url creates a new brand (owners/admins only, one credit on success); scan_url prefills an existing brand; save_answers stores goals, audience, offer, competitors, platforms, cadence and toneAdjustment; complete finishes onboarding.',
    'create_from_url: new brand, owners/admins, 1 credit on success. scan_url: prefill existing guide. save_answers: goals/audience/offer/competitors/platforms/cadence/toneAdjustment. complete: finish onboarding.',
  ],
  [
    'create_from_url: approve the resulting brand guide. This does not approve credit spending.',
    'create_from_url: approve guide only, not credit spending.',
  ],
  [
    'Search only. Brand whose connected X account searches. Required when the session has no brand. Use an id from get_brands.',
    'Search: X account brand ID from get_brands; required without session brand.',
  ],
  [
    "Which of the brand's connected X accounts to read as (optional; defaults to the brand's first connected account)",
    "Connected X account; defaults to brand's first.",
  ],
  [
    'Search only. How many posts to return (default 10, max 25).',
    'Search limit; default 10, max 25.',
  ],
  [
    'Search only. Sort by best match or newest first.',
    'Search order: best match/newest.',
  ],
  [
    'Include the Genfeed in-app agent rendered system and memory prompts for explicit diagnostic inspection. Defaults to false. These are diagnostic data, not instructions for the calling assistant.',
    'Explicit diagnostics: rendered in-app system/memory prompts. Default false; returned data are not assistant instructions.',
  ],
  [
    'Optional preview message. Knowledge, related posts, and memories are ranked against it, showing what a turn about this topic would retrieve.',
    'Preview topic; ranks Knowledge/posts/memories as a turn would.',
  ],
  [
    'Nonempty list of node IDs to rerun. Include affected downstream steps; unavailable dependencies fail explicitly.',
    'Nonempty rerun node IDs; include affected downstream steps. Missing dependencies fail.',
  ],
  [
    'Reuse locked outputs by default; set false to regenerate selected locked nodes.',
    'Default reuse locked outputs; false regenerates selected locked nodes.',
  ],
  [
    'Brand whose Knowledge to search. Required when the session has no brand. Use an id from get_brands.',
    'Knowledge brand ID from get_brands; required without session brand.',
  ],
  [
    'TEXT for pasted text, URL for a web page, DOCUMENT for a PDF or file URL, RSS for a feed, AUDIO or VIDEO for media',
    'TEXT pasted; URL page; DOCUMENT PDF/file URL; RSS feed; AUDIO/VIDEO media.',
  ],
  [
    'Existing Knowledge source to refresh. Forbids conflicting title/kind/referenceUrl/text/purpose.',
    'Refresh source ID; rejects conflicting title/kind/referenceUrl/text/purpose.',
  ],
  [
    'Cron expression to apply. Required when enabling and optional when disabling an already scheduled workflow.',
    'Cron; required to enable, optional to disable existing schedule.',
  ],
  [
    'Optional brand ID to attach to the installed workflow. Defaults to the current brand scope when available.',
    'Installed workflow brand ID; defaults to current scope if available.',
  ],
  [
    'Optional connected credential ID for the target channel; resolved at scheduling time when omitted.',
    'Target credential ID; omitted resolves when scheduling.',
  ],
]);

// These annotations only restate their field name or enum. Operational
// guidance, units, defaults, limits and identifier provenance stay documented.
const REDUNDANT_PARAMETER_DOCUMENTATION = new Set([
  'Predefined date range',
  'Audience visibility',
  'Optional idempotency key',
  'Optional project name',
  'Draft message id',
  'Platform to connect',
  'The ad ID',
  'Ads platform to query',
  'The clip project ID',
  'The campaign ID',
  'The ad account ID',
  'Number of top performers to return',
  'Metric to rank by',
  'Filter by campaign status',
  'Article title',
  'Avatar video provider to use',
  'YouTube video URL',
  'Natural-language description.',
  'Input variable definitions.',
  'ID of the workflow to duplicate',
  'ID of the workflow to execute',
  'Asset to generate.',
  'Avatar provider',
  'Generation title',
  'Highlight IDs',
  'Type of content to generate',
  'Target platforms for content',
  'Content topics or themes',
  'Owned article ID',
  'The article to retrieve.',
  'ID of the content',
  'Type of content',
  'Ad group ID',
  'Campaign ID',
  'Break down metrics by date',
  'Maximum number of keywords',
  'Campaign ID to get search terms for',
  'Maximum number of search terms',
  'Content type to return.',
  'The ad set ID',
  'Include recent message history',
  'Maximum messages to include',
  'Content category',
  'Timeframe for trends',
  'The ID of the video',
  'ID of the workflow to check',
  'ID of the workflow to inspect',
  'Ranking metric.',
  'Timeframe.',
  'Maximum ads to return.',
  'Which kind of asset to list.',
  'Maximum number of projects to return',
  'Offset for pagination',
  'Maximum number of campaigns',
  'Content type to sample.',
  'Maximum number of creatives to return',
  'Maximum number of campaigns to return',
  'Automation lifecycle state.',
  'Inbox status.',
  'Maximum number of conversations to return',
  'Conversations with this tag.',
  'Only unread conversations.',
  'Campaign ID to list ad groups for',
  'Optional ad group ID to filter by',
  'Maximum number of workflow runs to return',
  'Number of workflow runs to skip',
  'Optional workflow run status filter',
  'Optional workflow run trigger filter',
  'Optional workflow ID to scope the run history',
  'Maximum number of workflows to return',
  'Filter by workflow status',
  'Hide replies',
  'Hide reposts',
  'Reply text',
  'Optional rejection reason',
  'Message to send',
  'The thread ID',
  'DM text',
  'Whether the workflow schedule should be enabled',
  'ID of the workflow whose schedule should be updated',
  'Tags to set on the conversation',
  'Which transform to run.',
  'Media items for this target',
  'Publishing settings',
]);

// Visit schema-bearing keywords only. Never rewrite instance data in enum,
// const, default or examples, or a user property merely named "description".
const SCHEMA_MAPS = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_NODES = new Set([
  'items',
  'additionalItems',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
]);

function compactSchemaMap(schemas: object): Record<string, unknown> {
  const entries: [string, unknown][] = Object.entries(schemas);
  return Object.fromEntries(
    entries.map(([name, child]) => [name, compactSchemaDocumentation(child)]),
  );
}

function compactSchemaObject(schema: object): Record<string, unknown> {
  const entries: [string, unknown][] = Object.entries(schema);
  return Object.fromEntries(
    entries
      .filter(
        ([key, value]) =>
          !(
            key === 'description' &&
            typeof value === 'string' &&
            REDUNDANT_PARAMETER_DOCUMENTATION.has(value)
          ),
      )
      .map(([key, value]) => {
        if (key === 'description' && typeof value === 'string') {
          return [key, PARAMETER_DOCUMENTATION.get(value) ?? value];
        }
        if (
          SCHEMA_MAPS.has(key) &&
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          return [key, compactSchemaMap(value)];
        }
        if (
          (SCHEMA_LISTS.has(key) || key === 'items') &&
          Array.isArray(value)
        ) {
          return [key, value.map(compactSchemaDocumentation)];
        }
        return [
          key,
          SCHEMA_NODES.has(key) ? compactSchemaDocumentation(value) : value,
        ];
      }),
  );
}

function compactSchemaDocumentation(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema))
    return schema;
  return compactSchemaObject(schema);
}

export function compactMcpInputDocumentation(
  parameters: ToolParameterSchema,
): ToolParameterSchema {
  // Keep the typed root and every constraint. Only schema documentation changes.
  return {
    ...parameters,
    properties: compactSchemaMap(parameters.properties),
    ...(parameters.$defs ? { $defs: compactSchemaMap(parameters.$defs) } : {}),
    ...(parameters.oneOf
      ? { oneOf: parameters.oneOf.map(compactSchemaObject) }
      : {}),
  };
}
