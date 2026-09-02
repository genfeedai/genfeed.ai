import { ArticleCategory } from '@genfeedai/contracts';
import { buildSeoArticle, type SeoArticleBrief } from './seo-article-builder';

const genfeedLinks = [
  { label: 'Create with Genfeed', url: 'https://genfeed.ai/' },
  { label: 'Read the Genfeed documentation', url: 'https://docs.genfeed.ai/' },
  {
    label: 'Review Genfeed on GitHub',
    url: 'https://github.com/genfeedai/genfeed.ai',
  },
] as const;

const briefs: readonly SeoArticleBrief[] = [
  {
    answer:
      'Use image generators by production job. OpenAI image generation is useful for instruction-led creation and editing; Midjourney is strong for visual exploration and art direction; Adobe Firefly is designed for Adobe-centered commercial workflows; Ideogram emphasizes design and text-oriented composition; FLUX-family models provide flexible model and deployment options. Genfeed keeps briefs, references, models, approvals, and campaign assets in one workflow.',
    category: ArticleCategory.LISTICLE,
    decisionRows: [
      {
        choice: 'OpenAI image generation',
        fit: 'Instruction-following, iterative editing, and multimodal workflows',
        tradeoff:
          'Provider workflow and pricing should be verified for production volume',
      },
      {
        choice: 'Midjourney',
        fit: 'Rapid art direction and distinctive visual exploration',
        tradeoff:
          'Production integration and precise editing need workflow testing',
      },
      {
        choice: 'Adobe Firefly',
        fit: 'Teams already finishing work in Adobe products',
        tradeoff: 'Best value depends on the wider Adobe workflow',
      },
      {
        choice: 'Ideogram or FLUX-family models',
        fit: 'Design-oriented output or flexible model deployment',
        tradeoff: 'Capabilities and hosting terms vary by model and provider',
      },
    ],
    faq: [
      {
        question: 'Which generator makes the best marketing image?',
        answer:
          'The one that passes your campaign test for brand fit, product accuracy, editability, rights, speed, and approved cost. Aesthetic preference alone is insufficient.',
      },
      {
        question: 'Can AI render logos and product text correctly?',
        answer:
          'Capabilities have improved, but inspect every mark, label, claim, and package detail. Composite approved product assets manually when exactness matters.',
      },
      {
        question: 'Should marketers train a custom model?',
        answer:
          'Only after a reference-led workflow proves repeated demand and the team has rights-cleared training data and a fixed evaluation set.',
      },
      {
        question: 'How often should this comparison be repeated?',
        answer:
          'At least when a major model, price, license, or workflow change could materially affect the chosen production lane.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'Marketing teams do not need the most beautiful isolated image. They need a coherent set that respects the product, brand, campaign idea, media plan, rights, and revision deadline.',
      'This comparison avoids a universal ranking and instead maps current product families to jobs. Run the recommended evaluation with your own rights-cleared brief before standardizing a stack.',
    ],
    label: 'Best AI Image Generators for Marketing Teams in 2026',
    metrics: [
      'First-review acceptance across a campaign set',
      'Product, text, and identity correction rate',
      'Approved assets per art-director hour',
      'Generation plus editing cost per approved deliverable',
    ],
    mistakes: [
      'Testing only fantasy portraits instead of real campaign scenes',
      'Reviewing images one at a time rather than as a set',
      'Using generated logos, packaging, or claims without exact verification',
      'Ignoring provider terms, source rights, provenance, and export needs',
    ],
    publishedAt: '2026-11-03T09:00:00.000Z',
    sections: [
      {
        heading: 'Build a representative image benchmark',
        paragraphs: [
          'Include a hero composition, product interaction, lifestyle scene, close detail, text-bearing design, reference edit, challenging crop, and a consistent multi-image sequence. Use the actual brand palette and art direction.',
          'Record prompts, references, settings, attempts, latency, exports, and manual corrections. The approved set—not the favorite frame—is the result.',
        ],
      },
      {
        heading: 'Evaluate control and finishing',
        paragraphs: [
          'Inspect reference fidelity, edit masks, composition control, aspect ratios, resolution, color handling, transparent backgrounds, API access, and version reproducibility.',
          'Plan for finishing. Retouching, typography, exact products, accessibility, color management, and platform crops remain normal production tasks.',
        ],
      },
      {
        heading: 'Keep the campaign portable',
        paragraphs: [
          'Store the brief, source rights, references, selected outputs, model metadata, edits, and approved masters in the content system. Do not leave the only copy inside a provider gallery.',
          'Portability lets a team replace a model and regenerate a missing variant without losing the art direction or approval evidence.',
        ],
      },
    ],
    slug: 'best-ai-image-generators-marketing-teams',
    sources: [
      {
        label: 'OpenAI image generation guide',
        url: 'https://platform.openai.com/docs/guides/image-generation',
      },
      {
        label: 'Midjourney documentation',
        url: 'https://docs.midjourney.com/',
      },
      {
        label: 'Adobe Firefly',
        url: 'https://www.adobe.com/products/firefly.html',
      },
      { label: 'Ideogram', url: 'https://ideogram.ai/' },
      {
        label: 'Black Forest Labs FLUX models',
        url: 'https://blackforestlabs.ai/',
      },
    ],
    summary:
      'Compare leading image generators by art direction, editing, consistency, commercial workflow, portability, and approved cost.',
    workflow: [
      {
        action: 'Create a rights-cleared benchmark.',
        detail:
          'Use eight representative images and a campaign-level consistency requirement.',
      },
      {
        action: 'Test the production interface.',
        detail:
          'Evaluate prompting, reference use, editing, export, API, latency, and failure handling.',
      },
      {
        action: 'Measure corrections.',
        detail:
          'Record product, identity, text, composition, brand, and rights rework.',
      },
      {
        action: 'Finish normally.',
        detail:
          'Apply typography, retouching, exact assets, accessibility, and destination crops.',
      },
      {
        action: 'Review the full set.',
        detail:
          'Score cohesion and approved cost rather than picking one impressive image.',
      },
      {
        action: 'Archive portable evidence.',
        detail:
          'Preserve sources, metadata, edits, and approved masters outside the vendor gallery.',
      },
    ],
  },
  {
    answer:
      'Choose an AI video generator by shot type and control. Runway, Google’s video tooling, Adobe Firefly Video, Kling, Luma, and Pika represent different creative and workflow strengths; avatar tools solve a separate presenter job. Genfeed can route briefs and assets across models while preserving brand context, approvals, versions, and destination variants.',
    category: ArticleCategory.LISTICLE,
    decisionRows: [
      {
        choice: 'Runway or cinematic generation tools',
        fit: 'Directed scenes, image-to-video, and creative iteration',
        tradeoff: 'Continuity and exact product behavior need careful review',
      },
      {
        choice: 'Google or Adobe video workflows',
        fit: 'Teams valuing ecosystem integration and production tooling',
        tradeoff: 'Access, plan, and feature availability can vary',
      },
      {
        choice: 'Kling, Luma, or Pika',
        fit: 'Experimenting with motion styles and specialist shot generation',
        tradeoff:
          'Control, latency, and commercial workflow differ by provider',
      },
      {
        choice: 'Avatar platforms',
        fit: 'Scripted presenter, localization, and repeatable delivery',
        tradeoff: 'Not a substitute for open-ended cinematic production',
      },
    ],
    faq: [
      {
        question: 'Can one prompt create a finished short-form ad?',
        answer:
          'Occasionally, but dependable production usually combines script, shot plan, references, several generated clips, voice, music, captions, editing, and review.',
      },
      {
        question: 'What is image-to-video best for?',
        answer:
          'It gives the team more control over the starting composition and identity, although motion and final-frame drift still need evaluation.',
      },
      {
        question: 'How should video cost be compared?',
        answer:
          'Use approved seconds and finished deliverables, including failed generations and editing time, rather than provider credits alone.',
      },
      {
        question: 'Are generated videos safe for advertising?',
        answer:
          'They still require rights, likeness, claim, disclosure, product-accuracy, and platform-policy review.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'AI video products change quickly, and “best” depends on whether the team needs cinematic shots, product motion, avatars, effects, localization, or an editing workflow.',
      'A fair comparison starts with a shot list from a real campaign and measures the complete path to an approved vertical master.',
    ],
    label: 'Best AI Video Generators for Short-Form Content in 2026',
    metrics: [
      'Approved seconds per production hour',
      'Continuity and product correction rate',
      'Generation, editing, voice, and music cost per finished video',
      'Performance of matched creative concepts across model lanes',
    ],
    mistakes: [
      'Comparing demo reels instead of identical shot briefs',
      'Using a single long generation instead of editable shots',
      'Ignoring audio, captions, disclosure, and destination crops',
      'Reporting cheap credits while hiding failed generations and edit time',
    ],
    publishedAt: '2026-11-05T09:00:00.000Z',
    sections: [
      {
        heading: 'Benchmark shots, not slogans',
        paragraphs: [
          'Test talking subject, product interaction, camera move, environmental motion, typography-free transition, close detail, consistent character, and a difficult end frame. Use the same references and duration.',
          'Evaluate prompt adherence, motion quality, temporal artifacts, identity, product truth, camera control, latency, exports, and editability.',
        ],
      },
      {
        heading: 'Design a modular production stack',
        paragraphs: [
          'Write the concept and shot plan separately. Generate or source each shot, then edit voice, licensed music, sound design, captions, graphics, legal copy, and CTA in a deterministic timeline.',
          'This modular path makes a weak shot replaceable and creates multiple hooks or endings without regenerating the entire ad.',
        ],
      },
      {
        heading: 'Archive model and edit lineage',
        paragraphs: [
          'Store source images, prompts, model versions, generated clips, voice rights, music licenses, edit project, review notes, and exported destination masters.',
          'When a claim changes or a likeness permission expires, lineage identifies every affected deliverable.',
        ],
      },
    ],
    slug: 'best-ai-video-generators-short-form-content',
    sources: [
      { label: 'Runway', url: 'https://runwayml.com/' },
      {
        label: 'Google DeepMind video generation',
        url: 'https://deepmind.google/models/veo/',
      },
      {
        label: 'Adobe Firefly video',
        url: 'https://www.adobe.com/products/firefly/features/ai-video-generator.html',
      },
      { label: 'Luma Dream Machine', url: 'https://lumalabs.ai/dream-machine' },
      { label: 'Pika', url: 'https://pika.art/' },
    ],
    summary:
      'Compare short-form video tools by shot type, control, continuity, editability, rights, workflow, and cost per approved deliverable.',
    workflow: [
      {
        action: 'Write a shared shot benchmark.',
        detail:
          'Cover the actual people, product, motion, camera, and continuity challenges.',
      },
      {
        action: 'Generate modular clips.',
        detail:
          'Keep shots short and replaceable with source and model metadata.',
      },
      {
        action: 'Measure failure and edit time.',
        detail:
          'Count all attempts and corrections, not only selected generations.',
      },
      {
        action: 'Finish a real vertical master.',
        detail: 'Add voice, music, captions, graphics, disclosures, and CTA.',
      },
      {
        action: 'Review product and rights.',
        detail:
          'Verify likeness, claims, product behavior, licenses, and platform policy.',
      },
      {
        action: 'Archive the production package.',
        detail:
          'Preserve sources, clips, edit project, approvals, and exports.',
      },
    ],
  },
  {
    answer:
      'Choose models from the output backward. Copy needs reasoning, source discipline, and controllable voice; images need composition, reference fidelity, editing, and rights; video needs shot-level motion and continuity; voice needs pronunciation, emotion, consent, and licensing. Keep brand and workflow state outside the model so each lane can change independently.',
    category: ArticleCategory.GUIDE,
    decisionRows: [
      {
        choice: 'Copy model',
        fit: 'Research synthesis, planning, scripts, captions, and variants',
        tradeoff: 'Fluent claims still require source verification',
      },
      {
        choice: 'Image model',
        fit: 'Concepts, campaign stills, edits, backgrounds, and visual assets',
        tradeoff: 'Exact products, text, and identity need QA',
      },
      {
        choice: 'Video model',
        fit: 'Shot generation, motion, effects, avatars, or transformations',
        tradeoff: 'Higher latency, cost, and temporal failure rate',
      },
      {
        choice: 'Voice model',
        fit: 'Narration, localization, character, and accessibility workflows',
        tradeoff:
          'Consent, pronunciation, emotion, and usage rights are critical',
      },
    ],
    faq: [
      {
        question: 'Should every task use the most capable model?',
        answer:
          'No. Use the least expensive and fastest model that reliably clears the quality and risk threshold for that step.',
      },
      {
        question: 'How many models should a team support?',
        answer:
          'Keep a small approved roster per job with a primary, fallback, and experimental lane. Too many options weaken evaluation and support.',
      },
      {
        question: 'What belongs outside the model?',
        answer:
          'Brand truth, sources, rights, asset versions, approvals, destinations, costs, and performance history.',
      },
      {
        question: 'How are model upgrades tested?',
        answer:
          'Run a fixed regression set for representative briefs and compare quality, safety, latency, cost, and output compatibility before promotion.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'Model selection is often reduced to a leaderboard or provider preference. Production teams need a routing decision that accounts for output, control, risk, latency, cost, and the work surrounding the generation.',
      'The durable architecture treats models as replaceable workers inside a governed content system.',
    ],
    label:
      'How to Choose the Right AI Model for Copy, Images, Video, and Voice',
    metrics: [
      'Threshold pass rate on the fixed job-specific evaluation set',
      'Latency and total cost per approved output',
      'Correction rate by failure category',
      'Fallback success and provider availability',
    ],
    mistakes: [
      'Using one benchmark to choose every media model',
      'Comparing list price instead of approved-output cost',
      'Upgrading production immediately after a model launch',
      'Binding brand memory and assets to a provider project',
    ],
    publishedAt: '2026-11-10T09:00:00.000Z',
    sections: [
      {
        heading: 'Define a quality threshold per job',
        paragraphs: [
          'A caption variant, researched article, hero image, background plate, product video, and narration have different acceptance criteria and consequence. Write the rubric before testing.',
          'Include objective checks and expert judgment. Accuracy, identity, product truth, accessibility, rights, and editability can be harder gates than aesthetics.',
        ],
      },
      {
        heading: 'Measure the entire production cost',
        paragraphs: [
          'Record input and output usage, generation attempts, latency, failed jobs, human editing, review rounds, storage, and fallback. Calculate cost per approved artifact.',
          'A cheaper model can be more expensive if it creates correction or misses deadlines; an expensive model can be wasteful when a small transformation is deterministic.',
        ],
      },
      {
        heading: 'Operate primary, fallback, and experimental lanes',
        paragraphs: [
          'The primary clears the current threshold. The fallback has tested input and output compatibility. The experimental lane runs on sampled work and cannot publish directly.',
          'Promote changes through a regression set and canary volume. Preserve model metadata on every artifact for audit and comparison.',
        ],
      },
    ],
    slug: 'choose-ai-model-copy-images-video-voice',
    sources: [
      {
        label: 'OpenAI model documentation',
        url: 'https://platform.openai.com/docs/models',
      },
      {
        label: 'Anthropic model documentation',
        url: 'https://docs.anthropic.com/en/docs/about-claude/models',
      },
      {
        label: 'Google AI model documentation',
        url: 'https://ai.google.dev/models',
      },
      {
        label: 'Replicate model documentation',
        url: 'https://replicate.com/docs',
      },
    ],
    summary:
      'Route copy, image, video, and voice work by quality threshold, control, risk, total approved cost, fallback, and regression evidence.',
    workflow: [
      {
        action: 'Classify the job.',
        detail:
          'Define media, audience, consequence, controls, output contract, and deadline.',
      },
      {
        action: 'Write the evaluation set.',
        detail:
          'Use representative normal, difficult, safety, and regression cases.',
      },
      {
        action: 'Benchmark complete cost.',
        detail:
          'Capture attempts, latency, editing, review, failure, and approved output.',
      },
      {
        action: 'Select primary and fallback.',
        detail:
          'Verify compatible inputs, outputs, rights, and recovery behavior.',
      },
      {
        action: 'Canary upgrades.',
        detail:
          'Run experimental models on sampled work with no direct publish authority.',
      },
      {
        action: 'Review routing evidence.',
        detail:
          'Use production quality, cost, and incidents to revise the approved roster.',
      },
    ],
  },
  {
    answer:
      'Use a 1080×1920, 9:16 vertical master for TikTok, Instagram Reels, and most full-screen Shorts workflows, while treating each destination as a separate export and preview. YouTube currently classifies square or vertical videos up to three minutes as Shorts; Instagram accepts a wider Reel aspect-ratio range but 9:16 fills the screen; LinkedIn supports several ratios and often benefits from 4:5 or 9:16 depending on placement. Platform UI safe zones and limits change, so verify first-party guidance before launch.',
    category: ArticleCategory.GUIDE,
    decisionRows: [
      {
        choice: '9:16 at 1080×1920',
        fit: 'TikTok, Reels, and full-screen vertical Shorts master',
        tradeoff: 'UI overlays require generous edge and bottom clearance',
      },
      {
        choice: '4:5 at 1080×1350',
        fit: 'Feed-oriented vertical creative, including many LinkedIn and Instagram contexts',
        tradeoff: 'Does not fill a 9:16 player',
      },
      {
        choice: '1:1 at 1080×1080',
        fit: 'Square feeds and adaptable graphic-led content',
        tradeoff: 'Uses less vertical screen area',
      },
      {
        choice: '16:9 at 1920×1080',
        fit: 'Landscape video, YouTube long-form, and desktop-first placements',
        tradeoff: 'Poor fit for full-screen vertical feeds',
      },
    ],
    faq: [
      {
        question: 'Can one exported file be uploaded everywhere?',
        answer:
          'It may upload, but separate exports let you adjust framing, captions, cover, CTA, compression, and duration for each destination.',
      },
      {
        question: 'How long can a YouTube Short be?',
        answer:
          'YouTube’s current help documentation says square or vertical uploads up to three minutes can be classified as Shorts, subject to its current rules and rights restrictions.',
      },
      {
        question: 'What is a safe zone?',
        answer:
          'The region kept clear of platform controls, captions, profile elements, and cropping. Use current platform templates and a device preview because overlays change.',
      },
      {
        question: 'Should captions be burned in?',
        answer:
          'Use accurate platform captions where available and style on-screen emphasis separately. Keep critical text inside the conservative shared safe area.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'Short-form video fails technical review in small ways: a hook hidden by controls, captions under the CTA, a face cropped in the feed, or licensed audio that changes eligibility.',
      'A shared vertical master is efficient, but “shared” should not mean “identical upload.” Build one source composition and create destination-specific release candidates.',
    ],
    label: 'Short-Form Video Specs: TikTok, Reels, Shorts, and LinkedIn',
    metrics: [
      'Technical rejection and re-export rate',
      'Critical text or subject outside destination safe area',
      'Completion and hold rate by destination crop',
      'Delivery quality after platform compression',
    ],
    mistakes: [
      'Placing subtitles and CTA against the bottom edge',
      'Assuming organic and paid specifications are identical',
      'Using a copyrighted track without destination rights',
      'Rendering once without previewing each platform UI',
    ],
    publishedAt: '2026-11-12T09:00:00.000Z',
    sections: [
      {
        heading: 'Create a conservative vertical master',
        paragraphs: [
          'Compose at 1080×1920 with the subject and critical text away from edges and the lower control area. Maintain source footage at the highest practical quality and avoid tiny typography.',
          'Keep overlays in editable layers. A platform may crop the grid cover, show a feed preview at another ratio, or place controls differently on device classes.',
        ],
      },
      {
        heading: 'Export and validate per destination',
        paragraphs: [
          'TikTok favors full-screen vertical behavior; Instagram Reels accepts ratios from 1.91:1 to 9:16 and currently specifies at least 720 pixels and 30 FPS; YouTube accepts square or vertical Shorts up to three minutes under current rules.',
          'LinkedIn supports landscape, square, 4:5, and 9:16 in relevant video contexts. Its current ad guidance recommends 4:5 at 720×900 and lists 9:16 up to 1080×1920. Verify whether the item is organic or paid.',
        ],
      },
      {
        heading: 'Treat audio, captions, and covers as specs',
        paragraphs: [
          'Check loudness, speech intelligibility, music rights, caption accuracy, text contrast, and a deliberate cover frame. Platform-generated captions and thumbnails may need separate review.',
          'Upload privately or to a test destination when possible. Inspect the real device presentation before scheduling the approved version.',
        ],
      },
    ],
    slug: 'short-form-video-specs-tiktok-reels-shorts-linkedin',
    sources: [
      {
        label: 'Instagram Reel size and aspect ratios',
        url: 'https://www.facebook.com/help/1038071743007909',
      },
      {
        label: 'YouTube three-minute Shorts guidance',
        url: 'https://support.google.com/youtube/answer/15424877',
      },
      {
        label: 'TikTok advertising format guidance',
        url: 'https://ads.tiktok.com/help/article/tiktok-ads-policy-ad-format-and-functionality',
      },
      {
        label: 'LinkedIn video ad specifications',
        url: 'https://www.linkedin.com/help/linkedin/answer/a424737',
      },
    ],
    summary:
      'A current export and QA framework for vertical masters, destination variants, ratios, resolution, duration, captions, covers, and safe zones.',
    workflow: [
      {
        action: 'Edit a high-quality 9:16 master.',
        detail:
          'Use 1080×1920, editable text, rights-cleared audio, and conservative composition.',
      },
      {
        action: 'Create destination variants.',
        detail:
          'Adjust crop, duration, hook, CTA, captions, cover, and metadata.',
      },
      {
        action: 'Check the current spec.',
        detail:
          'Use first-party organic or advertising documentation for the exact placement.',
      },
      {
        action: 'Run a safe-zone overlay.',
        detail:
          'Keep faces, products, claims, captions, and CTA clear of controls and crops.',
      },
      {
        action: 'Preview on device.',
        detail:
          'Inspect feed, full-screen player, cover or grid, captions, and audio.',
      },
      {
        action: 'Lock each release file.',
        detail:
          'Store the approved destination master and delivery result separately.',
      },
    ],
  },
  {
    answer:
      'Keep editable source art and export a small platform set: 1080×1920 for Stories and vertical covers, 1080×1350 for 4:5 portrait feeds, 1080×1080 for square, and 1920×1080 or 1200×628 for 16:9-style landscape contexts. Do not rely on one universal safe-zone number: platform controls, placements, profile grids, and ad formats differ. Use current first-party templates and a conservative central composition.',
    category: ArticleCategory.GUIDE,
    decisionRows: [
      {
        choice: '1080×1920 (9:16)',
        fit: 'Stories, vertical video covers, and full-screen placements',
        tradeoff: 'Feed and profile previews may crop',
      },
      {
        choice: '1080×1350 (4:5)',
        fit: 'Portrait feed images and mobile screen coverage',
        tradeoff: 'Needs a separate full-screen Story export',
      },
      {
        choice: '1080×1080 (1:1)',
        fit: 'Square feed systems and flexible template libraries',
        tradeoff: 'Less screen area than portrait',
      },
      {
        choice: '1920×1080 or 1200×628',
        fit: 'Landscape video, link, and wide ad contexts',
        tradeoff: 'Critical content can become small on mobile',
      },
    ],
    faq: [
      {
        question: 'What is the safest universal image size?',
        answer:
          'There is no universal export. A centrally composed 4:5 or square concept can adapt well, but create and preview destination variants.',
      },
      {
        question: 'Why do recommended sizes differ from accepted sizes?',
        answer:
          'Platforms accept ranges, while recommendations optimize quality or placement fit. Accepted does not mean ideal.',
      },
      {
        question: 'How much margin should a safe zone use?',
        answer:
          'Use the current platform overlay for that placement and keep critical content inside an additional conservative margin. Do not hard-code one historical pixel value forever.',
      },
      {
        question: 'Should text be part of the generated image?',
        answer:
          'For exact marketing copy, add typography in an editable design layer so spelling, hierarchy, localization, and accessibility can be controlled.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'Social image specifications are deceptively unstable because a file can be accepted and still appear badly in feed, grid, preview, Story, or paid placement.',
      'The durable solution is a ratio-aware source template and a destination QA step, not a giant static list copied into every design brief.',
    ],
    label: 'Social Media Image Sizes and Safe Zones for 2026',
    metrics: [
      'Crop or obscured-content incidents',
      'Re-export rate after destination preview',
      'Template reuse across ratios without hierarchy loss',
      'Readability and accessibility at mobile display size',
    ],
    mistakes: [
      'Placing a logo, face, price, or CTA against an edge',
      'Confusing profile-grid crop with full post display',
      'Using a video safe-zone template for a different placement',
      'Adding exact copy inside a generative image instead of editable type',
    ],
    publishedAt: '2026-11-17T09:00:00.000Z',
    sections: [
      {
        heading: 'Design from a ratio system',
        paragraphs: [
          'Create source frames for 9:16, 4:5, 1:1, and 16:9 with shared grid, type scale, logo behavior, and focal rules. Link them to one campaign asset rather than treating exports as unrelated files.',
          'Generate backgrounds or subjects with room for responsive cropping. Keep exact product, logo, prices, disclosures, and typography in controlled layers.',
        ],
      },
      {
        heading: 'Use conservative safe composition',
        paragraphs: [
          'Reserve edges and the lower region for platform UI, and keep the primary subject, claim, and CTA near the optical center. Test long translated copy and accessibility zoom.',
          'A safe-zone overlay should be versioned with source and retrieval date. Platform changes are normal maintenance, not a one-time design fact.',
        ],
      },
      {
        heading: 'Preview every placement that matters',
        paragraphs: [
          'Check feed, profile or grid, full-screen viewer, Story, cover, link preview, and paid placement where applicable. Inspect a real mobile device and both light and dark surrounding UI.',
          'Store the approved export with destination, size, crop, alt text, and template version so scheduling cannot select the wrong file.',
        ],
      },
    ],
    slug: 'social-media-image-sizes-safe-zones',
    sources: [
      {
        label: 'Instagram Reel and cover size guidance',
        url: 'https://www.facebook.com/help/1038071743007909',
      },
      {
        label: 'Meta Ads Guide',
        url: 'https://www.facebook.com/business/ads-guide',
      },
      {
        label: 'TikTok creative specifications',
        url: 'https://ads.tiktok.com/help/article/video-ads-specifications',
      },
      {
        label: 'LinkedIn advertising specifications',
        url: 'https://www.linkedin.com/help/lms/answer/a427660',
      },
      {
        label: 'YouTube thumbnail guidance',
        url: 'https://support.google.com/youtube/answer/72431',
      },
    ],
    summary:
      'Use a maintainable ratio system and destination previews for 9:16, 4:5, square, landscape, covers, grids, and changing safe zones.',
    workflow: [
      {
        action: 'Create ratio-aware source frames.',
        detail:
          'Maintain 9:16, 4:5, 1:1, and 16:9 grids with shared brand rules.',
      },
      {
        action: 'Compose conservatively.',
        detail:
          'Keep critical subject, claims, logos, and CTA away from edges and controls.',
      },
      {
        action: 'Add exact elements manually.',
        detail:
          'Use editable product, typography, price, disclosure, and localization layers.',
      },
      {
        action: 'Check current placement guidance.',
        detail:
          'Verify accepted ratio, recommended resolution, format, size, and UI overlay.',
      },
      {
        action: 'Preview real surfaces.',
        detail:
          'Inspect mobile feed, full-screen, cover, grid, link, and paid placements.',
      },
      {
        action: 'Store destination metadata.',
        detail:
          'Attach size, crop, alt text, template version, and approval to each export.',
      },
    ],
  },
  {
    answer:
      'Create AI video ads as modular creative systems: one audience problem, several hooks, a product truth, a proof mechanism, clear offer, and platform-native endings. Generate or edit shots individually, preserve exact product and claim layers, then export and test separate TikTok, Reels, and Shorts versions. AI increases variant speed; it does not replace advertising evidence or rights review.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'Product demonstration',
        fit: 'Visible problem and believable transformation',
        tradeoff: 'Generated product behavior must be exact',
      },
      {
        choice: 'Creator or UGC-style',
        fit: 'Relatable problem framing and social proof',
        tradeoff: 'Likeness, testimonial, and disclosure rules apply',
      },
      {
        choice: 'Founder or expert',
        fit: 'Credibility, explanation, and category education',
        tradeoff: 'Requires approved claims and authentic authority',
      },
      {
        choice: 'Cinematic concept',
        fit: 'Attention, emotion, and brand salience',
        tradeoff: 'Can obscure the offer and product truth',
      },
    ],
    faq: [
      {
        question: 'How long should an AI video ad be?',
        answer:
          'Use the shortest duration that completes hook, proof, offer, and action. Platform ad placements have current limits; creative tests often benefit from several lengths.',
      },
      {
        question: 'How many hooks should be tested?',
        answer:
          'Begin with several genuinely different problem framings, not cosmetic wording changes, and hold the body stable to learn.',
      },
      {
        question: 'Can AI actors give testimonials?',
        answer:
          'Do not fabricate consumer experience or imply a synthetic person is a real customer. Use clear disclosure and follow advertising and endorsement rules.',
      },
      {
        question: 'Should organic and ad edits be identical?',
        answer:
          'They can share source shots, but paid placements need current ad specs, claims, disclosures, destination, and measurement setup.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'AI makes video variants cheap enough to expose a weak advertising process. If the audience, proof, offer, and learning plan are unclear, the team simply produces more uninformative creative.',
      'The useful workflow keeps concept variables explicit and the final timeline editable, so a test changes one meaningful thing at a time.',
    ],
    label: 'How to Create AI Video Ads for TikTok, Reels, and Shorts',
    metrics: [
      'Hook hold rate and destination-specific completion',
      'Qualified click, conversion, and incremental outcome',
      'Approved variants per production day',
      'Claim, product, rights, and platform rejection rate',
    ],
    mistakes: [
      'Generating a complete ad in one opaque clip',
      'Changing hook, body, offer, format, and audience in the same test',
      'Letting AI alter product appearance or performance',
      'Using fake social proof or unclear synthetic disclosure',
    ],
    publishedAt: '2026-11-19T09:00:00.000Z',
    sections: [
      {
        heading: 'Write a testable creative hypothesis',
        paragraphs: [
          'Define audience state, problem, promise, proof, offer, objection, and desired action. Choose the single variable the first test will change, often the hook or proof mechanism.',
          'Create a claims sheet with source evidence and prohibited exaggerations before scripting.',
        ],
      },
      {
        heading: 'Produce a modular shot library',
        paragraphs: [
          'Plan hook, problem, mechanism, product, proof, offer, CTA, and transition shots. Generate or capture them separately so the editor can replace failures and assemble variants.',
          'Use approved product plates and editable typography for exactness. Record likeness, voice, music, stock, and generation rights.',
        ],
      },
      {
        heading: 'Export native tests and learn',
        paragraphs: [
          'Create destination releases with correct ratio, safe zones, duration, captions, cover, CTA, disclosure, and tracking. Preview the actual placement.',
          'Start with controlled spend or audience volume, define a stopping rule, and roll learning back to the creative hypothesis rather than declaring a whole model “good” or “bad.”',
        ],
      },
    ],
    slug: 'create-ai-video-ads-tiktok-reels-shorts',
    sources: [
      {
        label: 'TikTok creative guidance',
        url: 'https://ads.tiktok.com/business/creativecenter/',
      },
      {
        label: 'Meta Ads Guide',
        url: 'https://www.facebook.com/business/ads-guide',
      },
      {
        label: 'YouTube advertising policies',
        url: 'https://support.google.com/adspolicy/',
      },
      {
        label: 'FTC endorsement guidance',
        url: 'https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews',
      },
    ],
    summary:
      'Build modular, truthful, rights-cleared vertical ad variants with controlled hypotheses, native exports, and measurable learning.',
    workflow: [
      {
        action: 'Define the hypothesis.',
        detail:
          'Write audience, problem, promise, proof, offer, CTA, and one test variable.',
      },
      {
        action: 'Approve claims and rights.',
        detail:
          'Attach evidence, product truth, likeness consent, licenses, and disclosure.',
      },
      {
        action: 'Plan modular shots.',
        detail: 'Separate hook, product, proof, offer, CTA, and transitions.',
      },
      {
        action: 'Generate and finish.',
        detail:
          'Create candidate shots, preserve exact layers, edit sound, captions, and graphics.',
      },
      {
        action: 'Export per destination.',
        detail:
          'Apply current specs, safe zones, covers, metadata, and tracking.',
      },
      {
        action: 'Run a controlled test.',
        detail:
          'Use stopping rules and promote learning into the next creative brief.',
      },
    ],
  },
  {
    answer:
      'Consistent campaign imagery requires an image system: a versioned art-direction brief, rights-cleared reference set, fixed product assets, shot taxonomy, model and setting records, set-level review, and controlled finishing. Use generation for variation inside the system, not as a fresh visual decision for every post.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'Reference-led prompting',
        fit: 'Most campaigns and early style development',
        tradeoff: 'Consistency depends on model reference controls and review',
      },
      {
        choice: 'Character or product reference workflow',
        fit: 'Recurring people, objects, and locations',
        tradeoff: 'Exact detail and angle coverage need source preparation',
      },
      {
        choice: 'Custom model or adapter',
        fit: 'High-volume identity with rights-cleared data',
        tradeoff: 'Training, evaluation, drift, and provider lifecycle',
      },
      {
        choice: 'Composite production',
        fit: 'Exact products, logos, typography, and regulated claims',
        tradeoff: 'More manual design and retouching',
      },
    ],
    faq: [
      {
        question: 'Can the same seed guarantee consistency?',
        answer:
          'No. Seeds can help reproducibility in some systems, but prompts, references, model versions, edits, and stochastic behavior all matter.',
      },
      {
        question: 'How many reference images are needed?',
        answer:
          'Use a small curated set covering the required identity, angles, materials, and lighting. Quality and relevance matter more than volume.',
      },
      {
        question: 'Should every image look identical?',
        answer:
          'No. Consistency preserves recognizable rules while allowing composition, emotion, scale, and narrative variation.',
      },
      {
        question: 'How are generated products handled?',
        answer:
          'Use generation for environment and ideation, then composite approved product photography or inspect every detail against the real item.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'A campaign is judged as a set. Ten individually attractive images can still fail when color, product, character, lighting, camera language, or emotional tone shifts between them.',
      'Consistency begins before prompting, with an art-direction system and a shot plan that define what remains fixed and what is allowed to vary.',
    ],
    label: 'How to Make Consistent AI Images Across an Entire Campaign',
    metrics: [
      'Set-level art-direction acceptance',
      'Identity, product, palette, and composition correction rate',
      'Reusable approved images per source setup',
      'Time to create a new destination crop or campaign extension',
    ],
    mistakes: [
      'Prompting each asset independently',
      'Using references that represent different visual systems',
      'Reviewing only zoomed-in single frames',
      'Generating exact logos, packaging, and copy as if they were decorative details',
    ],
    publishedAt: '2026-11-24T09:00:00.000Z',
    sections: [
      {
        heading: 'Write invariants and variables',
        paragraphs: [
          'Invariants may include character identity, product truth, palette, materials, lens family, lighting logic, texture, and brand mood. Variables include scene, action, crop, prop, and narrative beat.',
          'Turn these into an art-direction brief with annotated positive and negative references.',
        ],
      },
      {
        heading: 'Plan the campaign as a shot system',
        paragraphs: [
          'Define hero, product, detail, lifestyle, social proof, education, transition, and CTA roles before generation. Assign ratios and crops.',
          'Generate related groups from shared references and controlled settings. Preserve prompt, reference, model version, seed where supported, and edit history.',
        ],
      },
      {
        heading: 'Review and finish the set',
        paragraphs: [
          'View contact sheets at feed size and full resolution. Score identity, product, palette, light, camera, anatomy, artifacts, text, and narrative range.',
          'Composite exact products and typography, apply color finishing, export destination crops, and lock the approved campaign package.',
        ],
      },
    ],
    slug: 'make-consistent-ai-images-across-campaign',
    sources: [
      {
        label: 'OpenAI image generation documentation',
        url: 'https://platform.openai.com/docs/guides/image-generation',
      },
      {
        label: 'Midjourney image prompting documentation',
        url: 'https://docs.midjourney.com/',
      },
      {
        label: 'Adobe Firefly reference image guidance',
        url: 'https://helpx.adobe.com/firefly/',
      },
      { label: 'Content Credentials', url: 'https://contentcredentials.org/' },
    ],
    summary:
      'Define visual invariants, controlled variables, references, shot roles, model lineage, set review, and exact finishing for campaign consistency.',
    workflow: [
      {
        action: 'Approve the art-direction system.',
        detail:
          'Define invariants, variables, positive references, negative references, and exact assets.',
      },
      {
        action: 'Create the shot taxonomy.',
        detail:
          'Assign purpose, scene, subject, crop, ratio, and campaign beat to each image.',
      },
      {
        action: 'Generate controlled groups.',
        detail:
          'Reuse versioned references and settings while recording model lineage.',
      },
      {
        action: 'Review contact sheets.',
        detail:
          'Score identity, product, palette, light, camera, artifacts, and narrative range.',
      },
      {
        action: 'Finish exact elements.',
        detail:
          'Composite product, logo, typography, disclosure, and color treatment.',
      },
      {
        action: 'Archive the campaign package.',
        detail:
          'Store source, metadata, masters, crops, approvals, and usage rights.',
      },
    ],
  },
  {
    answer:
      'Create ten ad variations from one brief by defining a stable control and a deliberate variable matrix. Hold audience, offer, proof, destination, and body constant while testing distinct hooks first; then test proof, format, or CTA in later rounds. AI helps produce the matrix quickly, while structured naming and experiment design preserve what each result teaches.',
    category: ArticleCategory.TUTORIAL,
    decisionRows: [
      {
        choice: 'Hook variants',
        fit: 'Learning which problem framing earns attention',
        tradeoff: 'Body and offer must remain stable',
      },
      {
        choice: 'Proof variants',
        fit: 'Learning which evidence builds belief',
        tradeoff: 'Needs comparable hook and audience',
      },
      {
        choice: 'Format variants',
        fit: 'Comparing creator, demo, animation, image, or text-led execution',
        tradeoff: 'Production differences can confound the concept',
      },
      {
        choice: 'Offer or CTA variants',
        fit: 'Improving response after message-market fit',
        tradeoff: 'Changes conversion economics and audience expectation',
      },
    ],
    faq: [
      {
        question: 'Are ten headline rewrites ten creative variations?',
        answer:
          'Only if they represent meaningful hypotheses. Cosmetic synonym changes rarely create useful learning.',
      },
      {
        question: 'Should all ten launch at once?',
        answer:
          'Use a testing design appropriate to audience and budget. Sequential pruning or a balanced first round can be more informative than starving every cell.',
      },
      {
        question: 'Can AI choose the winner?',
        answer:
          'AI can summarize results and flag patterns. The decision needs valid measurement, sufficient data, business constraints, and human interpretation.',
      },
      {
        question: 'What should happen to losing variants?',
        answer:
          'Archive them with the hypothesis and result. A loss in one audience or format is evidence, not a universal creative ban.',
      },
    ],
    internalLinks: genfeedLinks,
    intro: [
      'Creative volume becomes valuable only when each variation represents a reasoned hypothesis. Without a matrix, ten outputs create noise and the team learns that one random combination happened to win.',
      'A structured brief separates fixed truth from testable expression and keeps every asset connected to the experiment it belongs to.',
    ],
    label: 'How to Create 10 Ad Variations From One Creative Brief',
    metrics: [
      'Valid test cells delivered without unintended differences',
      'Hook hold, proof engagement, click, conversion, and incremental outcome',
      'Production cost and time per testable variant',
      'Learning reused in the next creative round',
    ],
    mistakes: [
      'Changing several major variables in every asset',
      'Generating ten variations with no control',
      'Stopping on vanity engagement that does not match the objective',
      'Discarding experiment metadata after publication',
    ],
    publishedAt: '2026-11-26T09:00:00.000Z',
    sections: [
      {
        heading: 'Separate the fixed brief from the test matrix',
        paragraphs: [
          'Fix audience, problem, product truth, offer, proof inventory, brand rules, rights, destination, and outcome. Define one primary variable and a control.',
          'For a first round, write ten hook hypotheses such as pain, aspiration, mechanism, objection, demonstration, comparison, mistake, speed, identity, and evidence—only where each is truthful.',
        ],
      },
      {
        heading: 'Produce modular creative',
        paragraphs: [
          'Create a stable body and ending with replaceable hook slots. Use shot, voice, typography, and caption components that can be assembled without introducing accidental differences.',
          'Name every asset with experiment, variable, variant, version, and destination. Lock the approved payload sent to the platform.',
        ],
      },
      {
        heading: 'Analyze learning, not only winners',
        paragraphs: [
          'Check delivery balance and data quality before comparing outcomes. Review primary metrics, downstream quality, audience comments, and creative failure notes.',
          'Promote a conclusion only within the tested audience, offer, channel, and period. Use it to design the next round, often holding the winning hook while testing proof or format.',
        ],
      },
    ],
    slug: 'create-10-ad-variations-from-one-creative-brief',
    sources: [
      {
        label: 'Meta A/B testing guidance',
        url: 'https://www.facebook.com/business/help/1738164643098669',
      },
      {
        label: 'Google Ads experiments',
        url: 'https://support.google.com/google-ads/answer/6261395',
      },
      {
        label: 'TikTok Creative Center',
        url: 'https://ads.tiktok.com/business/creativecenter/',
      },
      {
        label: 'FTC advertising guidance',
        url: 'https://www.ftc.gov/business-guidance/advertising-marketing',
      },
    ],
    summary:
      'Turn one source-backed brief into a controlled creative matrix with modular production, stable naming, valid tests, and reusable learning.',
    workflow: [
      {
        action: 'Freeze the control.',
        detail:
          'Approve audience, claim, offer, proof, brand, destination, and baseline asset.',
      },
      {
        action: 'Choose one variable family.',
        detail:
          'Start with hooks, proof, format, CTA, or offer and state the hypothesis.',
      },
      {
        action: 'Design ten meaningful cells.',
        detail: 'Make each variant distinct, truthful, and comparable.',
      },
      {
        action: 'Produce modular assets.',
        detail:
          'Swap controlled components while preventing unintended differences.',
      },
      {
        action: 'Approve and name releases.',
        detail:
          'Store experiment, variable, version, destination, and exact payload.',
      },
      {
        action: 'Analyze and iterate.',
        detail:
          'Validate data, interpret within scope, and carry learning into the next matrix.',
      },
    ],
  },
];

export const SEO_ARTICLES_WAVE_3 = briefs.map(buildSeoArticle);
