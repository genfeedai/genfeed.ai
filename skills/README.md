# skills/

Genfeed.ai content and product skills — used by the application itself to power AI-driven content creation workflows.

## Skills

Generated from `skills/*/SKILL.md` frontmatter. Run `bun run scripts/check-skills-readme-drift.ts --write` after adding or changing a root product skill.

| Skill | Description |
| --- | --- |
| `ad-copy-creator` | Create paid ad copy for Meta, Google, LinkedIn, TikTok, and X using direct-response frameworks, platform limits, variants, and test plans. Triggers on ad headlines, ad creative, paid social ads, Google ads, and ad variants. |
| `ad-performance-analyzer` | Analyze paid media performance, diagnose issues, and provide optimization recommendations across all major ad platforms. Triggers on "analyze ad performance", "ad metrics", "why is my ROAS low", "ad optimization", "campaign performance", "creative fatigue", "ad budget allocation". |
| `blog-content-creator` | Create SEO-optimized blog posts in multiple formats with heading hierarchy, meta descriptions, and internal link strategy. Triggers on "write a blog post", "create a blog article", "draft a blog", "write an article", "blog about". |
| `brand-interview` | Interview an operator to extract their brand voice, audience, and content strategy, then write the answers into the brand profile. Pushes back on vague answers instead of accepting them. Triggers on "interview me", "grill me", "brand interview", "help me define my voice", "what is my brand voice", "fill in my brand profile", "onboard my brand", "my brand profile is empty". |
| `brand-os-architect` | Create source-backed Brand OS systems for AI-era brands, including positioning, voice, visual rules, content pillars, launch storytelling, CTA strategy, evidence, and generation checklists. Triggers on Brand OS, brand system, brand operating system, AI-readable brand book, brand kit generator, launch storytelling, Japanese color references, cute studies, and source-backed brand strategy. |
| `cinematic-prompting` | Rewrite naive image and video prompts with precise cinematography vocabulary. Triggers on "cinematic prompt", "film language", "camera movement", "make it cinematic", "shot from above", "enhance this image prompt", "enhance this video prompt", "cinematography vocabulary", "rewrite with camera terms". |
| `clip-editor` | Edit a finished clip directly from the agent. Read the clip and its transcript, propose an exact new window, then re-cut it with edit_clip once the user agrees. Triggers on "edit this clip", "cut the intro", "make this clip shorter", "this clip ends mid-sentence", "change where this clip starts", "retitle this clip". |
| `competitor-analyzer` | Audit competitors' content strategy across platforms, formats, topics, engagement patterns, and content gaps. Triggers on competitor content audits, social/content gap analysis, posting analysis, and competitive content reports. |
| `content-atomizer` | Repurpose one piece of content into dozens of platform-optimized derivatives with scheduling cadence and adaptation rules. Triggers on "atomize content", "repurpose content", "turn this into", "create derivatives", "cross-platform content". |
| `content-geo-optimizer` | Optimize long-form content for generative answer engines with a GEO scorecard, citation-ready structure, source attribution, and schema recommendations. Triggers on "optimize for GEO", "AI answer engine optimization", "make this citation-ready", "improve AI Overviews", "optimize for ChatGPT citations". |
| `content-reviewer` | Review and score content quality across six dimensions with actionable feedback. Triggers on "review this content", "score this post", "check content quality", "review my copy", "is this post ready to publish", "critique this content". |
| `content-seo-optimizer` | Analyze and optimize content for SEO with a 0-100 scoring rubric, platform-specific rules, and actionable improvement priorities. Triggers on "optimize for SEO", "SEO score", "check SEO", "audit content", "improve search ranking". |
| `content-strategist` | Build editorial content strategy: audience, pillars, platform roles, cadence, calendar, and KPI framework. Triggers on content strategy, editorial calendars, content plans, posting schedules, and content pillars. |
| `genfeed-brand-os` | Apply the Genfeed.ai Brand OS to product copy, website CTAs, launch content, skills, examples, prompts, and generation context. Triggers when creating Genfeed-branded content, Genfeed website copy, Genfeed launch narratives, Brand OS generator examples, product messaging, or AI-readable Genfeed brand guidance. |
| `image-prompt-engineer` | Craft optimized prompts for AI image and short video generation across major models, visual formats, aspect ratios, and content goals. Triggers on image prompts, video prompts, prompt optimization, Flux, DALL-E, Midjourney, and Genfeed visual prompts. |
| `instagram-carousel` | Plan and write an Instagram carousel; slide-by-slide copy, design spec, caption, hashtags and handoff to a local renderer for finished PNG slides. Use for "Instagram carousel", "carousel outline", "turn this into swipeable slides". For a single image use instagram-post; for LinkedIn use linkedin-carousel. |
| `instagram-post` | Write an Instagram feed post; the caption (hook, body, CTA), the hashtag set, alt text and the image brief for a single-image post. Use for "write an Instagram caption", "hashtag strategy", "IG post for this photo". For carousels use instagram-carousel; for Reels use instagram-reel; for Stories use instagram-story. |
| `instagram-reel` | Write an Instagram Reel; the hook, a timed shot-by-shot script with text overlays, the caption, audio direction and handoff to video tools. Use for "Reel script", "Instagram Reel idea", "short video for Instagram". For feed images use instagram-post; for Stories use instagram-story. |
| `instagram-story` | Write an Instagram Story sequence; a 5-7 frame arc with on-frame text, stickers (poll, question, quiz, slider, countdown, link, add yours), a CTA and a weekly theme calendar. Use for "Instagram Stories", "story sequence", "plan my stories". For feed posts use instagram-post; for Reels use instagram-reel. |
| `instagram-warmup` | Guide Instagram account warmup with engagement plans, Stories strategy, Reel and carousel warmup content, and post-warmup assessment frameworks. Triggers on "instagram warmup", "warm up instagram account", "new instagram account", "instagram account warmup plan", "instagram engagement plan", "warmup content instagram", "instagram trust score", "first post on instagram". |
| `launch-copy-creator` | Generate channel-conform launch copy for Hacker News (Show HN) and Product Hunt. Triggers on "write a show hn", "show hn title", "hacker news launch", "product hunt tagline", "product hunt launch copy", "maker comment", "launch copy". |
| `linkedin-article` | Write a LinkedIn article or a LinkedIn newsletter edition; keyword-aware long-form of 1,500-2,500 words with a hook, sections, action steps and a feed post to promote it. Use for "write a LinkedIn article", "LinkedIn newsletter edition", "turn this into a LinkedIn article". For a short post use linkedin-post; for a PDF carousel use linkedin-carousel. |
| `linkedin-carousel` | Plan and write a LinkedIn carousel (a swipeable PDF document post); slide outline, copy per slide, design rules, caption, and handoff to a local renderer for finished PNG and PDF slides. Use for "LinkedIn carousel", "PDF post", "turn this into slides for LinkedIn". For a text post use linkedin-post; for an Instagram carousel use instagram-carousel. |
| `linkedin-post` | Write a LinkedIn text post; story, insight, contrarian, listicle, celebration or objection-to-thought-leadership. Covers hooks, the 1,000-1,300 character shape, tone, hashtags, first-comment links, comment strategy and a pre-publish checklist. Use for "write a LinkedIn post", "thought leadership post". For long-form use linkedin-article; for a document/PDF post use linkedin-carousel. |
| `linkedin-warmup` | Guide LinkedIn account warmup with engagement plans, SSI-building strategy, comment-first content, and post-warmup assessment. Triggers on "linkedin warmup", "warm up linkedin", "new linkedin account", "linkedin account warmup plan", "linkedin engagement plan", "warmup content linkedin", "linkedin trust score", "first post on linkedin", "SSI score". |
| `model-selector` | Recommend the best AI model for image, video, and audio generation tasks. Triggers on "which model should I use", "recommend a model", "best model for", "what model for", "compare models", "fastest model for", "cheapest model for". |
| `newsletter-creator` | Create high-performing email newsletters with subject lines, editorial structures, and subscriber growth tactics. Triggers on "write a newsletter", "create a newsletter", "draft newsletter", "email newsletter", "newsletter edition". |
| `node-creator` | Create custom Genfeed nodes using the SDK. Triggers on "create a new node", "add a custom node type", "build a node for X". |
| `onboarding` | Quick onboarding for Genfeed focused on first content creation. Triggers on "how do I use genfeed", "getting started", "what is this app", "help me create my first content". |
| `openclaw-integration` | Connect to Genfeed.ai to create AI videos, images, articles, and more. Use when "genfeed", "create content", "generate video", "generate image", "publish content" mentioned. |
| `prompt-generator` | Generate optimized prompts for AI image and video generation. Triggers on "generate a prompt for", "write me a prompt", "create an image prompt", "create a video prompt", "optimize this prompt". |
| `scope-validator` | Validate feature requests against Genfeed OSS core vs Cloud scope. Helps users and contributors understand whether a feature belongs in the open-source core (submit PR) or Cloud SaaS (subscribe). |
| `tiktok-warmup` | Guide a transparent TikTok 5–7 day warm-up with native-app engagement, profile and feed tuning, gradual first uploads, and evidence-aware assessment. Triggers on "tiktok warmup", "warm up tiktok account", "new tiktok account", "tiktok account warmup plan", "tiktok engagement plan", "warmup content tiktok". |
| `visual-brand-kit` | Create visual identity systems for AI-generated content: colors, typography feel, photography style, composition rules, and prompt presets. Triggers on brand kits, visual guidelines, image style, and brand photography. |
| `workflow-creator` | Create Genfeed workflows from natural language descriptions. Triggers on "create a workflow", "build a content pipeline", "make a video generation workflow". |
| `x-article` | Write a long-form X Article, a titled and structured piece published natively on X, plus the promo post that sends the timeline to it. Covers title, header image, section structure, formatting and the launch post. Use for "write an X article", "long-form post on X", "turn this blog post into an X article". For a thread use x-thread; for a short post use x-post. |
| `x-post` | Write a single X (Twitter) post, quote post or reply that earns attention on its own. Covers hooks, the 280-character edit, quote and reply tactics, algorithm signals and a pre-post checklist. Use for "write a tweet", "draft an X post", "quote tweet", "reply to this post". For multi-post threads use x-thread; for long-form use x-article. |
| `x-thread` | Write an X (Twitter) thread of 2 to 15 posts with a hook, a value chain and a closing CTA. Covers opening templates, one-idea-per-post rules, formatting, the self-reply TL;DR and bump. Use for "write a thread", "turn this into a thread", "X thread on...". For a single post use x-post; for long-form use x-article. |
| `x-warmup` | Guide X/Twitter account warmup and source-backed X content hardening with engagement plans, reply-first strategy, warmup thread content, and post-warmup assessment. Triggers on "x warmup", "twitter warmup", "warm up x account", "new x account", "x account warmup plan", "x engagement plan", "warmup content x", "harder X content", "X content hardening". |
| `youtube-content-creator` | Create YouTube content including titles, descriptions, tags, thumbnail briefs, Shorts scripts, and retention strategies. Triggers on "write a youtube title", "youtube description", "youtube tags", "thumbnail brief", "shorts script", "youtube seo". |
| `youtube-warmup` | Guide YouTube channel warmup with engagement plans, channel optimization, warmup Shorts content, SEO-first setup, and post-warmup assessment. Triggers on "youtube warmup", "warm up youtube channel", "new youtube channel", "youtube channel warmup plan", "youtube engagement plan", "warmup content youtube", "youtube shorts warmup". |

## Catalog ownership and source updates

`catalog.lock.json` records the public source pin, every package file hash, the
legacy compiler version, instruction hashes, and excluded references. The
`upstream` packages are generated snapshots of the public `genfeedai/skills`
module packages (`<module>/<slug>`, copied flat into `skills/<slug>`). Their JSON formatting is preserved byte-for-byte by a narrow Biome
formatter exception; parsing, lint, and catalog integrity checks remain active.
Edit those packages in their source repository. Other packages remain
application-owned with an explicit application-procedure or deferred-reconciliation
reason; this does not classify all remaining content as application-specific.

To deliberately update from a clean public checkout at an exact full commit:

```sh
bun run skills:sync --source-dir /path/to/public/skills --commit FULL_SHA --write
bun run check:skills-catalog
bun run skills:sync --source-dir /path/to/public/skills --check-source
```

The initial migration rejects instruction changes. Later explicit pinned updates
may change instructions and their hashes; review that generated diff before shipping. Validation and runtime loading are offline. Reference limits are legacy
JavaScript character limits (8,000 per file, 16,000 total), not byte limits. The lock
lists large, nested, unsupported, empty, and budget-excluded reference files that
are inventoried but do not contribute instructions.

## Adding a skill

```
skills/my-skill/
  SKILL.md        # Skill definition (required)
  plugin.json     # Metadata (optional)
```

These skills are NOT for dev tooling — dev/build skills live in `.agents/skills/`.
