import type { ToolParameterSchema } from '../interfaces/tool-definition.interface';

// Exact reviewed wording only: changed canonical guidance falls back unchanged.
// Pricing and brand requirements are appended by the adapter, not moved out of
// the tool definition. Other surfaces retain their canonical documentation.
const TOOL_DOCUMENTATION = new Map([
  [
    'analyze_clip_project',
    {
      original:
        'Analyze a YouTube video for viral highlights: downloads audio, transcribes, and LLM-detects segments. Analysis does not charge credits. Poll with get_clip_project or get_clip_highlights.',
      concise:
        'Find viral highlights in a YouTube video via audio download, transcription and LLM analysis. Free; poll get_clip_project or get_clip_highlights.',
    },
  ],
  [
    'analyze_performance',
    {
      original:
        'Analyze recent content performance over the last 30 days. Returns engagement rates grouped by content type, platform, and posting time, plus top-performing posts.',
      concise:
        'Analyze 30-day engagement by content type, platform and posting time, including top posts.',
    },
  ],
  [
    'attach_remix_analysis_source',
    {
      original:
        'Select an eligible same-brand USER Library video for scene analysis, or clear with null. The selected Library media is analyzed; the original imported URL remains provenance. This does not infer permission or start paid analysis.',
      concise:
        'Select an eligible same-brand USER Library video for scene analysis; null clears it. Analyze selected media; retain the imported URL as provenance. Grants no permission and starts no paid analysis.',
    },
  ],
  [
    'capture_knowledge',
    {
      original:
        'Save a page, document, feed, media or pasted text into the brand Knowledge library and start ingestion. Pass sourceId to refresh an existing URL or RSS source. Default purpose is INSPIRATION; pass BRAND_TRUTH only for material the brand owns and vouches for.',
      concise:
        'Save page, document, feed, media or text to brand Knowledge and ingest it. sourceId refreshes an existing URL/RSS source. Default INSPIRATION; BRAND_TRUTH requires brand-owned, vouched-for material.',
    },
  ],
  [
    'complete_media_upload',
    {
      original:
        'Finalize a presigned media upload. Returns assetId and, when available, the hosted URL. Use assetId to attach media to a scheduled release, or use the hosted URL to attach media to a post draft.',
      concise:
        'Finalize a presigned upload; return assetId and available hosted URL. Attach assetId to a scheduled release or the URL to a post draft.',
    },
  ],
  [
    'control_scheduled_release',
    {
      original:
        'Request cancel, pause, resume or publish-now for an existing release. Use get_scheduled_release to review exact content, channels and timing; check check_channel(action=validate) before publish-now, and confirm the selected publishing credential is still connected before resume. publish-now requests immediate public posting and resume may restart scheduled or recurring posting. Every action waits for server-enforced approval; review and release in Genfeed.',
      concise:
        'Request cancel, pause, resume or publish-now. First review content/channels/timing with get_scheduled_release; check_channel(action=validate) before publish-now; verify the publishing credential remains connected before resume. publish-now requests immediate public posting; resume may restart scheduled/recurring posting. All actions require server-enforced approval; review/release in Genfeed.',
    },
  ],
  [
    'create_article_draft',
    {
      original:
        'Import a complete reviewed HTML article into the connected organization as an unpublished draft. Preserves supplied content without generation. Review the draft before publishing it separately.',
      concise:
        'Import reviewed HTML unchanged as an unpublished organization article draft. Review before separate publication; no generation.',
    },
  ],
  [
    'create_brand_from_url',
    {
      original:
        'Create a brand from a website URL with a draft guide and analyzed voice. Organization owners and admins only. Costs one credit on success. Set approve explicitly to approve the guide. Poll get_brand_scan_status if scanStatus is running.',
      concise:
        'Create a brand with draft guide and analyzed voice from a website. Owners/admins only; one credit on success. approve explicitly approves the guide. Poll get_brand_scan_status while scanStatus is running.',
    },
  ],
  [
    'create_clip_project_from_youtube',
    {
      original:
        'Create a clip project from a YouTube URL and run the AI clip factory async. HeyGen avatar clips are held per clip at the per-second avatar rate and settle to the rendered length. HeyGen/Argil need avatarId+voiceId; GenfeedAI needs a brand character reference. Poll get_clip_project.',
      concise:
        'Start an async YouTube clip project. HeyGen avatar holds use estimated per-clip seconds and settle to rendered length. HeyGen/Argil require avatarId+voiceId; GenfeedAI requires a brand character reference. Poll get_clip_project.',
    },
  ],
  [
    'create_instagram_remix_workflow',
    {
      original:
        'Create a draft, review-only Instagram remix workflow that adapts a public post pattern to the selected brand. This is prompt-based reinterpretation, not video style transfer.',
      concise:
        'Create a review-only draft remix workflow from a public Instagram pattern for this brand. Prompt-based reinterpretation, not video style transfer.',
    },
  ],
  [
    'create_post',
    {
      original:
        'Create a post draft from supplied text for review. It never publishes. Scheduling and publishing require a scheduled release and approval.',
      concise:
        'Create a reviewable post draft from supplied text; never publishes. Publishing/scheduling requires a scheduled release and approval.',
    },
  ],
  [
    'create_scheduled_release',
    {
      original:
        'Create a multi-channel release from prepared content and existing media. Use after check_channel(action=validate) for each channel. status draft (the default) saves for review; status scheduled or a scheduledDate requests future publishing, including recurring releases. Scheduling waits for server-enforced approval. If this connection cannot resolve approvals, review and release it in Genfeed.',
      concise:
        'Create a multi-channel release from prepared text/media after check_channel(action=validate) for each channel. Default draft saves for review; scheduled status or scheduledDate requests future/recurring publishing. Server approval required to schedule; if unavailable here, review/release in Genfeed.',
    },
  ],
  [
    'duplicate_workflow',
    {
      original:
        'Duplicate a workflow into the current organization and brand scope so the copy can be edited or scheduled without mutating the source workflow.',
      concise:
        'Copy a workflow into this organization/brand for editing or scheduling; source unchanged.',
    },
  ],
  [
    'enhance_prompt',
    {
      original:
        'Preview a media prompt using the same Enhance implementation as Studio and Agent, with effective organization/brand settings and contributing pack metadata. Costs 1 credit and requires confirmation; does not generate media. To generate the reviewed prompt unchanged, pass the returned prompt with harness:false. Model compilation during normal generation may add format-specific instructions; the generation receipt records the final submitted prompt.',
      concise:
        'Preview Studio/Agent media enhancement with effective organization/brand settings and pack metadata. Costs 1 credit; confirmation required; no media generation. Reuse the returned prompt with harness:false to preserve it. Model compilation may add format instructions; show the final submitted prompt from the generation receipt.',
    },
  ],
  [
    'execute_workflow',
    {
      original:
        'Execute an existing workflow immediately. Select nodeIds to rerun edited steps while reusing locked outputs; pass required variables for full or partial execution.',
      concise:
        'Run a workflow now. nodeIds reruns edited steps using locked outputs; supply required variables for full/partial runs.',
    },
  ],
  [
    'find_tools',
    {
      original:
        'Find tools callable on this connection, filtered by its endpoint permissions and caller role. Tools excluded from this endpoint are never returned. Can discover callable tools outside the current ?toolsets= selection. No arguments: list available toolsets and counts. query and/or toolset: search by name, description or toolset. name: describe one callable tool with its input schema, mutation policy, credit cost and required role.',
      concise:
        'Discover callable tools within endpoint permissions and caller role, including outside ?toolsets=. No args: toolsets/counts. query/toolset: search names, descriptions or toolsets. name: one tool with input schema, mutation policy, credit cost and role.',
    },
  ],
  [
    'generate',
    {
      original:
        'Generate an image, video, voice (text-to-speech) or music track. Set type; a parameter marked for another type is rejected. For model, pass a key from get_generation_options models, or omit it so the router picks. Image and video results include generationHarness with the exact submitted prompt and enhancement status: show that prompt with the result instead of reconstructing it. Image and video require a resolved model-specific quote and confirmation. The endpoint bills the prepared request; an unresolved quote never means free generation.',
      concise:
        'Generate image, video, voice (TTS) or music. Rejects fields for other types. Use model keys from get_generation_options or omit for routing. For image/video, show generationHarness exact submitted prompt and enhancement status; do not reconstruct. Requires resolved model-specific quote and confirmation for image/video; bills the prepared request. Unresolved quotes never mean free generation.',
    },
  ],
  [
    'generate_clips',
    {
      original:
        'Generate clips from selected highlights. HeyGen avatar clips are held per clip at the per-second avatar rate and settle to the rendered length. Avatar: avatarId+voiceId (HeyGen/Argil) or character ref (GenfeedAI); raw-cut: neither.',
      concise:
        'Generate selected highlights. HeyGen avatar holds use estimated per-clip seconds and settle to rendered length. Avatar requires avatarId+voiceId (HeyGen/Argil) or character reference (GenfeedAI); raw-cut requires neither.',
    },
  ],
  [
    'generate_content',
    {
      original:
        'Generate content for a topic or brief. Social types (caption, post, thread, script, article_outline) return ready-to-publish text written in the brand voice, with a brand receipt (receiptId) and hashtags, and are not scheduled or published; the exact text is kept on that receipt; use platform linkedin for LinkedIn posts and variationsCount for alternatives. type newsletter creates a saved newsletter draft. type article (or x-article) generates and saves an article draft with an id, ready to review and publish. Each field lists the types it applies to.',
      concise:
        'Generate brand-voice text from a topic/brief. Social types caption/post/thread/script/article_outline return text, hashtags and receiptId retaining exact text; never schedule/publish. linkedin platform targets LinkedIn; variationsCount adds alternatives. newsletter saves a newsletter draft; article/x-article saves an article draft with id for review/publication. Fields are type-specific.',
    },
  ],
  [
    'generate_turbo_content',
    {
      original:
        'Generate a Turbo run of content (images, videos, carousels) for a brand. Specify count, platforms, and date range. Use handle param to resolve @username to a credential. Requires approval: the first call returns a credit estimate and nothing is spent until the run is approved. Returns a Turbo run ID for tracking. Credits scale by item format and caption model tier — not a flat fee.',
      concise:
        'Generate a branded Turbo run of images/videos/carousels using count, platforms and date range. handle resolves @username to a credential. Requires approval: first call estimates credits; spends only after approval. Returns tracking run ID. Pricing scales by format and caption model tier.',
    },
  ],
  [
    'generate_visual_code',
    {
      original:
        'Create a versioned visual project from a prompt or directly supplied React/Remotion source. Requires a prior quote and approved maximumCredits. Untrusted code runs only in an isolated renderer; completed outputs enter the brand Library.',
      concise:
        'Create a versioned visual project from prompt or React/Remotion source. Requires prior quote and approved maximumCredits. Untrusted code runs in an isolated renderer; completed outputs enter brand Library.',
    },
  ],
  [
    'get_account',
    {
      original:
        'Get account details in one call: profile (user, organization, scoped brand, role, isOnboardingCompleted), credits (current balance) and usage (balance, 7 and 30 day credit spend, trend and spend breakdown by source). Defaults to all three; pass include to fetch fewer.',
      concise:
        'Read profile (user, organization, scoped brand, role, isOnboardingCompleted), credits balance and usage (balance, 7/30-day spend, trend, source breakdown). include selects sections; default all three.',
    },
  ],
  [
    'get_ads_ad_insights',
    {
      original:
        'Get performance insights for a single ad on any connected ads platform (Meta ad, Google Ads ad, TikTok ad, or X ad) through the platform-generic ads gateway',
      concise:
        "Read one ad's performance via the connected platform gateway: Meta, Google Ads, TikTok or X.",
    },
  ],
  [
    'get_ads_adset_insights',
    {
      original:
        'Get performance insights for one ad set on any connected ads platform (Meta ad set, Google Ads ad group, TikTok ad group, or X ad group) through the platform-generic ads gateway',
      concise:
        'Read ad-set/ad-group performance via the connected platform gateway: Meta, Google Ads, TikTok or X.',
    },
  ],
  [
    'get_articles',
    {
      original:
        'Get one article by articleId, or search published articles by query (optionally filtered by category). Pass exactly one of articleId or query.',
      concise:
        'Read by articleId or search published articles by query, optionally category-filtered. Pass exactly one of articleId or query.',
    },
  ],
  [
    'get_brand_completeness',
    {
      original:
        'Get the current brand context completeness score and a list of fields that still have gaps. Read-only, no credits charged.',
      concise:
        'Read brand context completeness score and missing fields. Free/read-only.',
    },
  ],
  [
    'get_brand_context',
    {
      original:
        'Read structured brand context for writing or reviewing on-brand content: identity, guidelines, voice, strategy, topics, persona, prompt seeds, performance insights, knowledge, recent posts, saved memories and active skills. Includes context diagnostics and model metadata. Rendered system and memory prompts are omitted unless explicitly requested for diagnostics. Read-only, no credits charged.',
      concise:
        'Read brand identity, guidelines, voice, strategy, topics, persona, prompt seeds, performance insights, Knowledge, recent posts, memories and active skills, plus diagnostics/model metadata. Rendered system/memory prompts require explicit diagnostics request. Free/read-only.',
    },
  ],
  [
    'get_brands',
    {
      original:
        "Read the organization's brands. Without brand it lists every brand with name, description and tone profile. With brand it returns that one brand, matched by id, slug, name or label. When more than one brand exists, pass the chosen brand's id as brandId to other tools; the first brand is never used implicitly.",
      concise:
        'Read organization brands with name, description and tone. brand selects one by id/slug/name/label; omit for all. With multiple brands, pass the chosen id as brandId to other tools; never implicitly use the first.',
    },
  ],
  [
    'get_clip_highlights',
    {
      original:
        "Get the detected highlights for a clip project after analysis. Returns the highlights array plus the project's current status.",
      concise:
        'Read detected clip-project highlights and current status after analysis.',
    },
  ],
  [
    'get_generation_options',
    {
      original:
        "Read what generation can do right now, for free and without paid confirmation. models is always returned: this account's callable catalog. Pass an image, video or music models key as generate.model, and an image-edit key as transform_media.model. Voice rows are not generate.model; voice generation uses voiceId. settings is the effective image/video prompt enhancement with organization or brand overrides, always returned. cost is the Studio credit estimate and organization balance, only when type is given. Returns the same catalog estimate the Generate composer shows and the same Genfeed balance as the credits bar. Does not charge credits, change a price, or authorize a generation. Omit modelKey, or pass Auto, for image, image-edit and video estimate status auto. Music Auto quotes the registry music default. Voice, unsupported, missing or unpriced models return estimate status unavailable with credits null. balance is null when the wallet cannot be read; a numeric 0 is a real empty balance. Threaded Agent calls use the validated current thread brand; brandId must match it. In threadless MCP calls, brandId selects the brand scope for settings.",
      concise:
        'Free/read-only callable model catalog and effective image/video enhancement settings. Use image/video/music model keys as generate.model, image-edit keys as transform_media.model; voice uses voiceId. With type, return Studio credit estimate and organization balance; never charges, reprices or authorizes generation. Omitted/Auto modelKey leaves image/image-edit/video estimates auto; music quotes registry default. Voice/unsupported/missing/unpriced estimates: unavailable, credits null. Unreadable wallet: balance null; 0 means empty. MCP brandId selects settings scope; threaded Agent brandId must match its validated thread brand.',
    },
  ],
  [
    'get_job_status',
    {
      original:
        'Check the status and result of any generation (image, video, voice, music) by the job id returned when the generation started. Auto-detects content type.',
      concise:
        'Read generation status/result by returned job or ingredient ID; auto-detects image/video/voice/music.',
    },
  ],
  [
    'get_posts',
    {
      original:
        'Read posts. postId returns one post (exclusive with the other fields). days returns the content calendar for the coming days: scheduled and draft posts with gap analysis showing days without content. With neither, lists recent posts, optionally filtered by executionState and capped by limit. Post items carry channel target, execution state, media, and timestamps.',
      concise:
        'Read postId alone for one post; days for upcoming draft/scheduled calendar and gaps; otherwise recent posts filtered by executionState/limit. Items include channel target, state, media and timestamps.',
    },
  ],
  [
    'get_x_posts',
    {
      original:
        "Read X posts. Costs 1 credit and requires confirmation. postIdOrUrl opens one post and returns its text and stats. query searches recent posts by topic through the brand's connected X account and returns author, text, stats, and link; it explains clearly if that account cannot search. Pass exactly one of postIdOrUrl or query.",
      concise:
        'Read X posts. Costs 1 credit; confirmation required. Exactly one: postIdOrUrl returns text/stats; query searches recent topics via brand-connected X account, returning author/text/stats/link or explaining unsupported search.',
    },
  ],
  [
    'import_source_post',
    {
      original:
        'Import a supported public X, Instagram or TikTok post into Imported sources for an explicit brand. Returns source/post identities and deduplication. Requires approval for external import; never generates, publishes or adds Knowledge.',
      concise:
        'Import a public X/Instagram/TikTok post for explicit brand into Imported sources; return source/post identities and deduplication. External import requires approval. Never generates, publishes or adds Knowledge.',
    },
  ],
  [
    'install_system_workflow',
    {
      original:
        'Install one system workflow catalog entry into the current organization as an editable, schedulable copy. Installing the same entry twice returns the existing workflow.',
      concise:
        'Install an official workflow as an editable/schedulable organization copy. Reinstall returns existing copy.',
    },
  ],
  [
    'list_assets',
    {
      original:
        'List library assets of one type, newest first, for one brand: brandId, else the thread brand, else your current brand; with none of those it lists the whole organization. Failed, archived and rejected assets are left out. Types image, video, music and avatar return id, category, status, url, label or prompt, origin, tags (id and label) and createdAt. Type character lists the active named characters the brand can use, including characters another organization granted to yours for use only (handle, label, description, whether a reference image exists, and who granted it). A revoked grant disappears on the next call.',
      concise:
        'List Library assets newest-first. Brand scope: brandId, thread brand, current brand, else organization. Excludes failed/archived/rejected. image/video/music/avatar return id, category, status, url, label/prompt, origin, tags (id/label), createdAt. character returns active usable characters, including use-only grants from other organizations: handle, label, description, reference-image presence, grantor. Revocations disappear next call.',
    },
  ],
  [
    'list_orgs',
    {
      original:
        'List every organization you belong to, which one this connection works inside, and the brands in it. get_account, get_brands and every other tool act only in the active organization. When the connection allows switching, use switch_org to change it; otherwise reconnect and choose another on the consent screen.',
      concise:
        'List member organizations, active organization and its brands. All tools use the active organization. switch_org changes it when permitted; otherwise reconnect and choose at consent.',
    },
  ],
  [
    'list_system_workflow_catalog',
    {
      original:
        'List the code-owned Genfeed system workflow catalog with per-organization install state. Use this to discover official automations before installing one.',
      concise:
        'Discover official code-owned automations and organization install state before installing.',
    },
  ],
  [
    'onboard_brand',
    {
      original:
        'Set up a brand inside this conversation. Organization owners and admins can use create_from_url to create a new brand from a website for one credit on success; this queues the brand creation for approval. For an existing brand, scan_url prefills its guide, save_answers stores goals, audience, offer, competitors, platforms, cadence and tone, and complete finishes account onboarding.',
      concise:
        'Set up a brand conversationally. Owners/admins: create_from_url creates from website for one credit on success, queued for approval. Existing brand: scan_url prefills guide; save_answers stores goals/audience/offer/competitors/platforms/cadence/tone; complete finishes account onboarding.',
    },
  ],
  [
    'open_in_editor',
    {
      original:
        'Open existing videos in the Studio Editor. Creates a draft Editor project seeded with sourceVideoIds in order (one clip each, up to 50) and returns its id and /studio/editor path. Does not generate, render, or publish.',
      concise:
        'Create a Studio Editor draft from sourceVideoIds in order (one clip each, max 50). Return project id and /studio/editor path. No generation, render or publication.',
    },
  ],
  [
    'publish_article',
    {
      original:
        'Publish an owned reviewed article on the public website. Requires approval. Review the article before requesting publication. Changes publication status without regenerating the body or replacing an existing publication date.',
      concise:
        'Publish an owned reviewed article publicly after approval. Review before requesting publication. Changes status only; preserves body and existing publication date.',
    },
  ],
  [
    'quote_remix_generation',
    {
      original:
        'Save a concrete generation quote for this revision without dispatch. Image requires an explicit model; copy uses its canonical model. Video/avatar uses scene analysis, generate or repair quotes and rejects model. Inspect the quote before approval. BYOK can still incur external provider costs.',
      concise:
        'Save revision quote without dispatch. Image requires explicit model; copy uses canonical model. Video/avatar uses scene analysis/generate/repair quotes and rejects model. Inspect before approval. BYOK may incur external provider costs.',
    },
  ],
  [
    'repurpose_post',
    {
      original:
        'Repurpose an existing post into a draft for another channel. Deterministic mode adapts the caption instantly through the channel capability catalog (length, hashtags, links, media compatibility); agent mode rewrites it with the content engine and lands the draft in the review queue. Never publishes or schedules anything.',
      concise:
        'Create another-channel draft from a post. deterministic instantly adapts caption length/hashtags/links/media via channel rules; agent rewrites via content engine into review queue. Never publishes/schedules.',
    },
  ],
  [
    'request_media_upload',
    {
      original:
        'Reserve a pending asset for the selected brand and return uploadUrl, assetId, method, and constraints. For PUT, send file bytes with the returned headers. For POST_JSON, send localUpload as JSON, adding base64 file bytes in localUpload.source.data. Then call complete_media_upload. Does not publish or attach the file.',
      concise:
        'Reserve brand asset; return uploadUrl, assetId, method, constraints. PUT: file bytes and returned headers. POST_JSON: localUpload JSON with base64 bytes at localUpload.source.data. Then complete_media_upload. Never publishes/attaches.',
    },
  ],
  [
    'resolve_approval',
    {
      original:
        'Approve or decline a pending MCP write action that was queued for human review, executing it on approval. Organization owners and admins only. Pass the approvalId returned by the original (pending) tool call.',
      concise:
        'Owners/admins: approve (execute) or decline (cancel) a pending MCP write using approvalId from its original call.',
    },
  ],
  [
    'retry_visual_code_project',
    {
      original:
        'Explicitly retry retained source from a failed or cancelled visual revision using a new requestId and approved quote. No automatic source repair occurs; inspect prior diagnostics for uncertain provider work.',
      concise:
        'Explicitly retry failed/cancelled visual source with new requestId and approved quote. No automatic source repair; inspect prior diagnostics for uncertain provider work.',
    },
  ],
  [
    'search_knowledge',
    {
      original:
        'Search the brand Knowledge library (saved pages, documents and notes) and return cited passages with their source, purpose and relevance. Use it before writing anything that must be accurate about the brand.',
      concise:
        'Search saved brand Knowledge pages/documents/notes for cited passages, source, purpose and relevance. Use before writing facts about the brand.',
    },
  ],
  [
    'set_generation_settings',
    {
      original:
        'Set organization or brand prompt enhancement. Use null to restore inheritance. Threaded Agent calls use the validated current thread brand; brandId must match it. In threadless MCP calls, brandId selects the brand scope. Generation pricing is unchanged.',
      concise:
        'Set organization/brand prompt enhancement; null restores inheritance. MCP brandId selects brand scope; threaded Agent brandId must match validated thread brand. Pricing unchanged.',
    },
  ],
  [
    'set_workflow_schedule',
    {
      original:
        'Enable, disable, or update the schedule on an editable workflow duplicate. Disabling requires no new cron expression when the workflow already has one.',
      concise:
        "Enable/disable/update an editable workflow copy's schedule. Disabling an existing schedule needs no new cron.",
    },
  ],
  [
    'start_brand_interview',
    {
      original:
        'Start a brand context interview for the given brand. Charges 10 credits once (idempotent — resuming an active session does not re-charge). Returns the first question to ask the user, plus progress and completeness info.',
      concise:
        'Start/resume a brand context interview. Costs 10 credits once; resuming active session is free. Return first question, progress and completeness.',
    },
  ],
  [
    'start_remix_generation',
    {
      original:
        'Execute the exact persisted quote and revision after explicit approval. Routes by canonical output/quote; repeated accepted execution retrieves the same run rather than buying another attempt.',
      concise:
        'Execute exact persisted quote/revision after explicit approval, routing by canonical output/quote. Repeated accepted execution returns same run without another purchase.',
    },
  ],
  [
    'submit_brand_interview_answer',
    {
      original:
        "Submit the user's answer to the current interview question. Pass the interviewId from start_brand_interview. Returns the next question (if any) and updated progress.",
      concise:
        'Submit current answer with interviewId from start_brand_interview; return next question, if any, and progress.',
    },
  ],
  [
    'switch_org',
    {
      original:
        'Switch which organization this connection works inside, by its name, slug or id from list_orgs. Only available when the connection was approved with organization switching on. Your role in the organization is checked on every request.',
      concise:
        'Switch active organization by name/slug/id from list_orgs. Requires organization-switching consent; role checked each request.',
    },
  ],
  [
    'transform_media',
    {
      original:
        'Change existing media or join clips. operation edit: apply an exact instruction to a Library image (the original stays unchanged; imageId is the primary source, references adds up to four ordered images for Ideogram or nine for FLUX.3; FLUX.3 supports one output, resolution and aspectRatio, with no mask or seed; optional maskId must match the primary dimensions, black changes and white stays; uses the image-editing category default, never the generation model; do not enhance or rewrite the instruction). operation reframe: re-crop an image to a new aspect ratio. operation upscale: upscale an image to higher resolution from its URL. operation merge: join two or more existing videos into one clip with transitions, captions, resizing, mute and background music; slideshow zoom (zoomEaseCurve and zoomConfigs) is not supported and is rejected before any merge starts. Each field lists the operations it applies to; a field for another operation is rejected. Edit, reframe and upscale spend credits through the shared generation settlement; merge runs locally and is free.',
      concise:
        'Transform existing media; fields for other operations reject. edit: exact instruction on primary Library imageId; original unchanged. Never enhance/rewrite instructions. Ordered references: Ideogram max 4, FLUX.3 max 9. FLUX.3: one output, resolution/aspectRatio, no mask/seed. Mask must match primary dimensions; black changes, white stays. Uses image-editing default, never generation model. reframe: re-crop ratio. upscale: increase resolution from URL. merge: join 2+ videos with transitions/captions/resize/mute/music; zoomEaseCurve/zoomConfigs slideshow zoom rejects before starting. edit/reframe/upscale spend via shared generation settlement; local merge is free.',
    },
  ],
  [
    'update_scheduled_release',
    {
      original:
        'Change content, media, recurrence or timing on an existing release, or scheduling/settings on one target. Use get_scheduled_release to inspect its current content and state, then check_channel(action=validate) before changing publishing settings. Changes to already-live content may update public posts. Every update waits for server-enforced approval; review and apply in Genfeed.',
      concise:
        "Update release content/media/recurrence/timing or one target's scheduling/settings. Inspect get_scheduled_release first; check_channel(action=validate) before publishing-setting changes. Live-content changes may update public posts. All updates require server approval; review/apply in Genfeed.",
    },
  ],
]);

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
    'Video only. Start-frame image URL for image-to-video; with audioUrl, talking-avatar lip-sync.',
    'Video start-frame URL; with audioUrl enables avatar lip-sync.',
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
    'List mode only. Maximum number of posts to return (default 10).',
    'List-only result limit; default 10.',
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

export function compactMcpToolDescription(
  name: string,
  description: string,
): string {
  const entry = TOOL_DOCUMENTATION.get(name);
  if (
    !entry ||
    (description !== entry.original &&
      !description.startsWith(`${entry.original} `))
  ) {
    return description;
  }
  return entry.concise + description.slice(entry.original.length);
}

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
