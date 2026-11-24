import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import {
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import {
  BrainCircuit,
  Calendar,
  Clapperboard,
  Film,
  GitBranch,
  Image,
  Layers,
  LayoutTemplate,
  Megaphone,
  Newspaper,
  Package,
  Palette,
  PenTool,
  Quote,
  Rocket,
  Scissors,
  Search,
  Shuffle,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  Users,
  Video,
  Wand,
  Zap,
} from 'lucide-react';

/* Skill category */

export interface SkillEntry {
  slug: string;
  name: string;
  description: string;
  icon: IconType;
}

export interface SkillCategory {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  skills: SkillEntry[];
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    id: 'content-creation',
    label: 'Content creation',
    skills: [
      {
        description:
          'Single posts, quote posts, and replies with hook formulas and algorithm signals.',
        icon: XTwitterIcon,
        name: 'X Post',
        slug: 'x-post',
      },
      {
        description:
          'Multi-post threads with a hook, a payoff per post, and a closing call to action.',
        icon: XTwitterIcon,
        name: 'X Thread',
        slug: 'x-thread',
      },
      {
        description:
          'Long-form X Articles with a headline, structure, and a promotion plan.',
        icon: XTwitterIcon,
        name: 'X Article',
        slug: 'x-article',
      },
      {
        description:
          'Feed posts with captions, hashtag strategy, and a first-line hook.',
        icon: InstagramIcon,
        name: 'Instagram Post',
        slug: 'instagram-post',
      },
      {
        description:
          'Swipeable carousels with a slide-by-slide script and caption.',
        icon: InstagramIcon,
        name: 'Instagram Carousel',
        slug: 'instagram-carousel',
      },
      {
        description:
          'Reels scripts with hooks, shot lists, on-screen text, and captions.',
        icon: InstagramIcon,
        name: 'Instagram Reel',
        slug: 'instagram-reel',
      },
      {
        description:
          'Story sequences with stickers, polls, and a clear next tap.',
        icon: InstagramIcon,
        name: 'Instagram Story',
        slug: 'instagram-story',
      },
      {
        description:
          'Professional posts with a strong first line and comment-worthy ending.',
        icon: LinkedinIcon,
        name: 'LinkedIn Post',
        slug: 'linkedin-post',
      },
      {
        description: 'Long-form LinkedIn articles and newsletter editions.',
        icon: LinkedinIcon,
        name: 'LinkedIn Article',
        slug: 'linkedin-article',
      },
      {
        description:
          'Document carousels with a slide-by-slide script and caption.',
        icon: LinkedinIcon,
        name: 'LinkedIn Carousel',
        slug: 'linkedin-carousel',
      },
      {
        description:
          'Titles, descriptions, tags, chapters, thumbnail briefs, and Shorts scripts.',
        icon: YoutubeIcon,
        name: 'YouTube Creator',
        slug: 'youtube-content-creator',
      },
      {
        description:
          'Newsletter editions with subject-line variants, editorial structure, and growth tactics.',
        icon: Newspaper,
        name: 'Newsletter Creator',
        slug: 'newsletter-creator',
      },
      {
        description:
          'SEO-optimized blog posts, guides, case studies, and pillar pages.',
        icon: PenTool,
        name: 'Blog Creator',
        slug: 'blog-content-creator',
      },
      {
        description:
          'Landing pages, CTAs, value propositions, onboarding copy, and product microcopy.',
        icon: PenTool,
        name: 'Copywriter',
        slug: 'copywriter',
      },
      {
        description:
          'Find fresh public X posts worth quote-posting, ranked with a fit reason and an angle.',
        icon: Quote,
        name: 'Quote Finder',
        slug: 'quote-finder',
      },
      {
        description:
          'Truthful, click-worthy titles for livestreams, recaps, cutdowns and Shorts.',
        icon: YoutubeIcon,
        name: 'YouTube Title',
        slug: 'youtube-title',
      },
      {
        description:
          'Descriptions with an opener, takeaway, accurate chapters, sources and links.',
        icon: YoutubeIcon,
        name: 'YouTube Description',
        slug: 'youtube-description',
      },
      {
        description:
          'Branded thumbnails with exactly three test concepts for livestreams and recaps.',
        icon: YoutubeIcon,
        name: 'YouTube Thumbnail',
        slug: 'youtube-thumbnail',
      },
      {
        description:
          'The on-screen hook, cover text and searchable first line of the caption.',
        icon: TiktokIcon,
        name: 'TikTok Title',
        slug: 'tiktok-title',
      },
      {
        description:
          'TikTok captions with a hook line, one supporting fact, hashtags and disclosure.',
        icon: TiktokIcon,
        name: 'TikTok Description',
        slug: 'tiktok-description',
      },
      {
        description:
          'Channel-conform launch copy for Hacker News (Show HN) and Product Hunt.',
        icon: Rocket,
        name: 'Launch Copy Creator',
        slug: 'launch-copy-creator',
      },
      {
        description:
          'Plan, write and schedule a week of social content in one session over the Genfeed MCP.',
        icon: Calendar,
        name: 'Weekly Batch',
        slug: 'weekly-batch',
      },
    ],
    subtitle:
      'Platform-native content with hooks, hashtags, SEO, and conversion copy ready to publish.',
    title: 'Create for Every Platform',
  },
  {
    id: 'optimization',
    label: 'Content optimization',
    skills: [
      {
        description:
          'SEO score (0-100) with keyword placement, readability, meta optimization, and schema markup.',
        icon: Search,
        name: 'SEO Optimizer',
        slug: 'content-seo-optimizer',
      },
      {
        description:
          'GEO scorecard, citation-ready rewrites, source attribution, and answer-engine schema guidance.',
        icon: BrainCircuit,
        name: 'GEO Optimizer',
        slug: 'content-geo-optimizer',
      },
      {
        description:
          'Operate content intake, briefs, production queues, review gates, and analytics loops.',
        icon: Package,
        name: 'Factory Operator',
        slug: 'content-factory-operator',
      },
      {
        description:
          'Repurpose one source asset into platform-native derivatives across every channel.',
        icon: Shuffle,
        name: 'Content Atomizer',
        slug: 'content-atomizer',
      },
      {
        description:
          '6-dimension quality scoring: clarity, voice, hook, CTA, platform fit, accuracy.',
        icon: Sparkles,
        name: 'Content Reviewer',
        slug: 'content-reviewer',
      },
      {
        description:
          'Editorial strategy, content pillars, platform roles, cadence, calendars, and KPIs.',
        icon: Target,
        name: 'Content Strategist',
        slug: 'content-strategist',
      },
      {
        description:
          'Rewrite AI drafts to sound natural while preserving meaning, structure, and voice.',
        icon: Sparkles,
        name: 'Humanizer',
        slug: 'humanizer',
      },
    ],
    subtitle:
      'SEO scoring, quality review, production operations, repurposing, and humanization.',
    title: 'Optimize before you publish',
  },
  {
    id: 'content-analysis',
    label: 'Content analysis',
    skills: [
      {
        description:
          'Pull and score trend signals for the Genfeed content loop.',
        icon: TrendingUp,
        name: 'Trend Scout',
        slug: 'trend-scout',
      },
      {
        description:
          'Collect post-performance metrics and feed them back into content-loop learning.',
        icon: Target,
        name: 'Analytics Collector',
        slug: 'analytics-collector',
      },
      {
        description:
          'Audit competitor content strategy, channels, formats, topics, and engagement gaps.',
        icon: Users,
        name: 'Competitor Analyzer',
        slug: 'competitor-analyzer',
      },
      {
        description:
          'Deconstruct YouTube videos into hooks, retention mechanics, and reusable blueprints.',
        icon: YoutubeIcon,
        name: 'YouTube Video Analyst',
        slug: 'youtube-video-analyst',
      },
    ],
    subtitle:
      'Trend detection, analytics collection, competitor research, and retention teardown.',
    title: 'Learn from the Market',
  },
  {
    id: 'communications',
    label: 'Communications',
    skills: [
      {
        description:
          'Status reports, 3P updates, leadership updates, newsletters, FAQs, and incident reports.',
        icon: Newspaper,
        name: 'Internal Comms',
        slug: 'internal-comms',
      },
    ],
    subtitle:
      'Structured updates for teams, leaders, customers, and operational incidents.',
    title: 'Communicate clearly',
  },
  {
    id: 'image-visual',
    label: 'Image & visual',
    skills: [
      {
        description:
          'Optimized prompts with model-specific tips for Flux, DALL-E, Midjourney, and Imagen.',
        icon: Image,
        name: 'Image Prompt Engineer',
        slug: 'image-prompt-engineer',
      },
      {
        description:
          'Visual brand systems: colors, typography feel, composition rules, and prompt presets.',
        icon: Palette,
        name: 'Visual Brand Kit',
        slug: 'visual-brand-kit',
      },
      {
        description:
          'Generate image, video, and audio artifacts through Replicate or fal.ai workers.',
        icon: Wand,
        name: 'Media Forge',
        slug: 'media-forge',
      },
      {
        description:
          'Rewrite naive image and video prompts with precise cinematography vocabulary.',
        icon: Film,
        name: 'Cinematic Prompting',
        slug: 'cinematic-prompting',
      },
      {
        description:
          'Optimized prompts for AI image and video generation from a short brief.',
        icon: Wand,
        name: 'Prompt Generator',
        slug: 'prompt-generator',
      },
      {
        description:
          'Realistic shot prompts as a timed shot list with references, a spoken line and sound.',
        icon: Video,
        name: 'Video Realism',
        slug: 'video-realism',
      },
      {
        description:
          'Run one prompt through two or three video models and merge the clips side by side.',
        icon: Layers,
        name: 'Video Model Benchmark',
        slug: 'video-model-benchmark',
      },
    ],
    subtitle:
      'Optimized prompts, model selection, visual systems, and media generation workers.',
    title: 'Prompt any model',
  },
  {
    id: 'advertising',
    label: 'Advertising',
    skills: [
      {
        description:
          'Ad copy with PAS, AIDA, BAB, StoryBrand frameworks: variants for every platform.',
        icon: Megaphone,
        name: 'Ad Copy Creator',
        slug: 'ad-copy-creator',
      },
      {
        description:
          'KPI benchmarks, creative fatigue detection, budget allocation, scaling criteria.',
        icon: TrendingUp,
        name: 'Ad Performance Analyzer',
        slug: 'ad-performance-analyzer',
      },
      {
        description:
          'Free prompt pack for selfie, talking-head and screen-demo video ads.',
        icon: Megaphone,
        name: 'UGC Ad Prompts',
        slug: 'ugc-ad-prompts',
      },
    ],
    subtitle:
      'Direct response frameworks and performance analysis for Meta, Google, LinkedIn, and TikTok.',
    title: 'Ads that convert',
  },
  {
    id: 'gtm-strategy',
    label: 'GTM strategy',
    skills: [
      {
        description:
          'Brand foundations: name, positioning, voice, and strategic identity.',
        icon: Palette,
        name: 'Brand Architect',
        slug: 'brand-architect',
      },
      {
        description:
          'Differentiated market angles, mechanisms, narratives, and positioning tests.',
        icon: Target,
        name: 'Positioning Angles',
        slug: 'positioning-angles',
      },
      {
        description:
          'ICP, buyer personas, buying centers, pains, triggers, and targeting focus.',
        icon: Users,
        name: 'Startup ICP Definer',
        slug: 'startup-icp-definer',
      },
      {
        description:
          'Premium and value-based pricing strategy, tiers, price-rise plans, and confidence.',
        icon: TrendingUp,
        name: 'Pricing Strategist',
        slug: 'pricing-strategist',
      },
      {
        description:
          'High-converting offers, bundles, guarantees, packages, and value stacks.',
        icon: Sparkles,
        name: 'Offer Architect',
        slug: 'offer-architect',
      },
      {
        description:
          'Existing offer scoring and fixes against the Value Equation.',
        icon: Sparkles,
        name: 'Offer Validator',
        slug: 'offer-validator',
      },
      {
        description:
          'Sales funnels, value ladders, customer journeys, and landing-page sequences.',
        icon: LayoutTemplate,
        name: 'Funnel Architect',
        slug: 'funnel-architect',
      },
      {
        description:
          'Funnel audits for hook, story, offer, value ladder fit, traffic match, and conversion path.',
        icon: LayoutTemplate,
        name: 'Funnel Validator',
        slug: 'funnel-validator',
      },
      {
        description:
          'Audience acquisition strategy using Dream 100, organic, paid, and owned audience paths.',
        icon: Megaphone,
        name: 'Traffic Architect',
        slug: 'traffic-architect',
      },
      {
        description:
          'Traffic strategy scoring across channel clarity, hook strategy, funnel alignment, and conversion path.',
        icon: Megaphone,
        name: 'Traffic Validator',
        slug: 'traffic-validator',
      },
      {
        description:
          'Channel focus and expansion-readiness validation against the One Channel Rule.',
        icon: Shuffle,
        name: 'Channel Validator',
        slug: 'channel-validator',
      },
      {
        description:
          'Lead generation channel prioritization by ROI, cost, close rate, effort, and system potential.',
        icon: Target,
        name: 'Lead Channel Optimizer',
        slug: 'lead-channel-optimizer',
      },
      {
        description:
          'Cold email, DM, prospecting, personalization, and outbound sequence optimization.',
        icon: Megaphone,
        name: 'Outbound Optimizer',
        slug: 'outbound-optimizer',
      },
      {
        description:
          'Prospect accounts, decision makers, contact details, company data, and buyer intent signals.',
        icon: Search,
        name: 'Leads Researcher',
        slug: 'leads-researcher',
      },
      {
        description:
          'Contact email discovery, domain patterns, and verification guidance.',
        icon: Search,
        name: 'Email Finder',
        slug: 'email-finder',
      },
      {
        description:
          'GTM competitors, market positioning, feature gaps, pricing, and win/loss patterns.',
        icon: Users,
        name: 'Competitive Intelligence',
        slug: 'competitive-intelligence-analyst',
      },
      {
        description:
          'Affiliate, integration, reseller, co-marketing, embedded distribution, and partner outreach strategy.',
        icon: GitBranch,
        name: 'Partnership Builder',
        slug: 'partnership-builder',
      },
      {
        description:
          'Activation, ascension, upsell, subscription, churn reduction, and LTV systems.',
        icon: TrendingUp,
        name: 'Retention Engine',
        slug: 'retention-engine',
      },
      {
        description:
          'Scalable support systems, docs, FAQs, ticketing, self-service, automation, and response templates.',
        icon: Users,
        name: 'Support Systems Architect',
        slug: 'support-systems-architect',
      },
      {
        description:
          'Customer friction, buying objections, implementation blockers, refund causes, and success obstacles.',
        icon: Target,
        name: 'Constraint Eliminator',
        slug: 'constraint-eliminator',
      },
      {
        description:
          'Personal expert positioning, authority, origin story, Big Domino, and new opportunity framing.',
        icon: BrainCircuit,
        name: 'Expert Architect',
        slug: 'expert-architect',
      },
      {
        description:
          'Existing expert positioning and authority narrative scoring.',
        icon: BrainCircuit,
        name: 'Expert Validator',
        slug: 'expert-validator',
      },
      {
        description:
          'Domain syntax validation, availability-oriented checks, and brandable domain options.',
        icon: Search,
        name: 'Search Domain Validator',
        slug: 'search-domain-validator',
      },
      {
        description:
          'Source-backed brand systems: positioning, voice, visual rules and content pillars.',
        icon: Palette,
        name: 'Brand OS Architect',
        slug: 'brand-os-architect',
      },
      {
        description:
          'Apply the Genfeed Brand OS to product copy, CTAs, launch content and prompts.',
        icon: Palette,
        name: 'Genfeed Brand OS',
        slug: 'genfeed-brand-os',
      },
    ],
    subtitle:
      'Positioning, offers, funnels, traffic, lead generation, retention, and expert authority.',
    title: 'Build the Market Engine',
  },
  {
    id: 'video-rendering',
    label: 'Video & rendering',
    skills: [
      {
        description:
          'Cut vertical 9:16 clips from a long recording locally with ffmpeg and burned-in captions.',
        icon: Scissors,
        name: 'Clip Cutter',
        slug: 'clip-cutter',
      },
      {
        description:
          'Turn a long recording into branded Shorts: pick, cut, caption and place the logo.',
        icon: YoutubeIcon,
        name: 'YouTube Shorts',
        slug: 'youtube-shorts',
      },
      {
        description:
          'Turn a long recording or clip into a branded 9:16 TikTok with captions.',
        icon: TiktokIcon,
        name: 'TikTok Video',
        slug: 'tiktok-video',
      },
      {
        description:
          'Write a Remotion composition with your own agent subscription and render it locally.',
        icon: Clapperboard,
        name: 'Motion Video',
        slug: 'motion-video',
      },
      {
        description:
          'Render a carousel spec into branded PNG slides and a PDF with headless Chrome.',
        icon: Layers,
        name: 'Carousel Renderer',
        slug: 'carousel-renderer',
      },
      {
        description:
          'Composite three branded thumbnail variants locally from a backdrop and exact text.',
        icon: Image,
        name: 'Thumbnail Compositor',
        slug: 'thumbnail-compositor',
      },
      {
        description:
          'Assemble shots, stills, text, voiceover and music into a finished ad on your machine.',
        icon: Megaphone,
        name: 'Ad Pack Assembly',
        slug: 'ad-pack-assembly',
      },
      {
        description:
          'A reusable profile for logo placement, caption font, thumbnail rules and export sizes.',
        icon: Palette,
        name: 'Video Brand Profile',
        slug: 'video-brand-profile',
      },
      {
        description:
          'Turn a voice note or transcript into a long-form video storyboard with cutaway briefs.',
        icon: Clapperboard,
        name: 'Long-form Storyboard',
        slug: 'long-form-storyboard',
      },
    ],
    subtitle:
      'Local tools that turn a recording into Shorts, thumbnails, carousels and finished ads on your own machine.',
    title: 'Cut, caption and render locally',
  },
  {
    id: 'account-warmup',
    label: 'Account warmup',
    skills: [
      {
        description:
          'Reply-first warmup for X with thread content and a post-warmup assessment.',
        icon: XTwitterIcon,
        name: 'X Warmup',
        slug: 'x-warmup',
      },
      {
        description:
          'Engagement plans, Stories strategy and Reel warmup content for Instagram.',
        icon: InstagramIcon,
        name: 'Instagram Warmup',
        slug: 'instagram-warmup',
      },
      {
        description:
          'Comment-first warmup with SSI-building strategy for LinkedIn.',
        icon: LinkedinIcon,
        name: 'LinkedIn Warmup',
        slug: 'linkedin-warmup',
      },
      {
        description:
          'A transparent 5 to 7 day TikTok warmup with gradual first uploads.',
        icon: TiktokIcon,
        name: 'TikTok Warmup',
        slug: 'tiktok-warmup',
      },
      {
        description:
          'Channel optimization, warmup Shorts and SEO-first setup for YouTube.',
        icon: YoutubeIcon,
        name: 'YouTube Warmup',
        slug: 'youtube-warmup',
      },
    ],
    subtitle:
      'Engagement plans, first-post guidance and post-warmup assessment for each platform.',
    title: 'Warm up a new account',
  },
  {
    id: 'platform',
    label: 'Platform & dev',
    skills: [
      {
        description:
          'Operate the executable Genfeed content loop and route each stage to the right skill.',
        icon: Shuffle,
        name: 'Content Loop Orchestrator',
        slug: 'content-loop-orchestrator',
      },
      {
        description:
          'Detect Genfeed connectivity and provide content-loop state, token, manifest, and feedback handoff.',
        icon: BrainCircuit,
        name: 'Genfeed Connector',
        slug: 'genfeed-connector',
      },
      {
        description:
          'Publish approved derivatives to X or LinkedIn with a dry-run-by-default approval gate.',
        icon: Package,
        name: 'Social Poster',
        slug: 'social-poster',
      },
    ],
    subtitle:
      'Workflow creation, custom nodes, content-loop operations, and agent integration.',
    title: 'Build with Genfeed',
  },
];

export const FREE_SKILL_COUNT = SKILL_CATEGORIES.reduce(
  (total, category) => total + category.skills.length,
  0,
);

/* Premium registry types */

export interface SkillRegistryEntry {
  category: string;
  description: string;
  name: string;
  slug: string;
}

export interface SkillRegistry {
  bundlePrice: number;
  skills: SkillRegistryEntry[];
}

/* Stats */

export const STATS = [
  { label: 'Free Skills', value: String(FREE_SKILL_COUNT) },
  { label: 'Categories', value: String(SKILL_CATEGORIES.length) },
];

/* Terminal demo commands */

export const TERMINAL_COMMANDS = [
  { command: 'bunx skills add genfeedai/skills', prompt: '~' },
  {
    command: `Installing ${FREE_SKILL_COUNT} skills from genfeedai/skills...`,
    prompt: '',
  },
  { command: '\u2713 x-post', prompt: '' },
  { command: '\u2713 instagram-reel', prompt: '' },
  { command: '\u2713 content-seo-optimizer', prompt: '' },
  { command: '\u2713 image-prompt-engineer', prompt: '' },
  { command: '\u2713 ad-copy-creator', prompt: '' },
  { command: `... and ${FREE_SKILL_COUNT - 5} more`, prompt: '' },
  { command: `# \u2713 All ${FREE_SKILL_COUNT} skills installed`, prompt: '' },
] as const;

/* How It Works steps */

export interface HowItWorksStep {
  number: string;
  title: string;
  description: string;
  icon: IconType;
}

export const HOW_IT_WORKS: HowItWorksStep[] = [
  {
    description: `One command installs all ${FREE_SKILL_COUNT} free skills into your Claude Code workspace.`,
    icon: Terminal,
    number: '01',
    title: 'Install',
  },
  {
    description:
      'Your agent reads each skill, its rules, patterns, and domain knowledge, and follows them.',
    icon: BrainCircuit,
    number: '02',
    title: 'Agent reads',
  },
  {
    description:
      'Skills activate at exactly the right moment. Say "write a tweet" and the X skill takes over.',
    icon: Zap,
    number: '03',
    title: 'Create content',
  },
  {
    description:
      'Inside Genfeed, skills use platform tools like create_post, generate, and rate_content for even better output.',
    icon: Package,
    number: '04',
    title: 'Better with Genfeed',
  },
];
