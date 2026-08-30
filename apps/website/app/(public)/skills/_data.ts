import {
  InstagramIcon,
  LinkedinIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import {
  BrainCircuit,
  Code,
  GitBranch,
  Image,
  LayoutTemplate,
  Megaphone,
  Newspaper,
  Package,
  Palette,
  PenTool,
  Rocket,
  Search,
  Shuffle,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  Users,
  Wand,
  Zap,
} from 'lucide-react';

/* ─── Skill category ─── */

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
    label: 'Content Creation',
    skills: [
      {
        description:
          'Posts, threads, and replies with viral hook formulas and algorithm optimization.',
        icon: XTwitterIcon,
        name: 'X Content Creator',
        slug: 'x-content-creator',
      },
      {
        description:
          'Captions, carousels, Reels scripts, and Story sequences with hashtag strategy.',
        icon: InstagramIcon,
        name: 'Instagram Creator',
        slug: 'instagram-content-creator',
      },
      {
        description:
          'Professional posts, articles, carousels, and newsletter editions.',
        icon: LinkedinIcon,
        name: 'LinkedIn Creator',
        slug: 'linkedin-content-creator',
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
    ],
    subtitle:
      'Platform-native content with hooks, hashtags, SEO, and conversion copy ready to publish.',
    title: 'Create for Every Platform',
  },
  {
    id: 'optimization',
    label: 'Content Optimization',
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
    title: 'Optimize Before You Publish',
  },
  {
    id: 'content-analysis',
    label: 'Content Analysis',
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
    title: 'Communicate Clearly',
  },
  {
    id: 'image-visual',
    label: 'Image & Visual',
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
          'Pick the right model for the job: face consistency, speed, quality, and cost tiers.',
        icon: Zap,
        name: 'Model Selector',
        slug: 'model-selector',
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
    ],
    subtitle:
      'Optimized prompts, model selection, visual systems, and media generation workers.',
    title: 'Prompt Any Model',
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
    ],
    subtitle:
      'Direct response frameworks and performance analysis for Meta, Google, LinkedIn, and TikTok.',
    title: 'Ads That Convert',
  },
  {
    id: 'gtm-strategy',
    label: 'GTM Strategy',
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
    ],
    subtitle:
      'Positioning, offers, funnels, traffic, lead generation, retention, and expert authority.',
    title: 'Build the Market Engine',
  },
  {
    id: 'platform',
    label: 'Platform & Dev',
    skills: [
      {
        description:
          'Create Genfeed Studio workflows from natural language descriptions.',
        icon: GitBranch,
        name: 'Workflow Creator',
        slug: 'workflow-creator',
      },
      {
        description: 'Custom nodes using the Genfeed SDK fluent builder API.',
        icon: Code,
        name: 'Node Creator',
        slug: 'node-creator',
      },
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
      {
        description:
          'Get started with Genfeed through first content creation in under 10 minutes.',
        icon: Rocket,
        name: 'Onboarding',
        slug: 'onboarding',
      },
      {
        description:
          'Classify Genfeed feature requests as OSS Core or Cloud SaaS scope.',
        icon: LayoutTemplate,
        name: 'Scope Validator',
        slug: 'scope-validator',
      },
      {
        description: 'Connect AI agents to Genfeed via MCP.',
        icon: BrainCircuit,
        name: 'OpenClaw Integration',
        slug: 'openclaw-integration',
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

/* ─── Premium registry types ─── */

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

/* ─── Stats ─── */

export const STATS = [
  { label: 'Free Skills', value: String(FREE_SKILL_COUNT) },
  { label: 'Categories', value: String(SKILL_CATEGORIES.length) },
  { label: 'Open Source', value: '100%' },
  { label: 'Install Time', value: '<10s' },
];

/* ─── Terminal demo commands ─── */

export const TERMINAL_COMMANDS = [
  { command: 'bunx skills add genfeedai/skills', prompt: '~' },
  {
    command: `Installing ${FREE_SKILL_COUNT} skills from genfeedai/skills...`,
    prompt: '',
  },
  { command: '\u2713 x-content-creator', prompt: '' },
  { command: '\u2713 instagram-content-creator', prompt: '' },
  { command: '\u2713 content-seo-optimizer', prompt: '' },
  { command: '\u2713 image-prompt-engineer', prompt: '' },
  { command: '\u2713 ad-copy-creator', prompt: '' },
  { command: `... and ${FREE_SKILL_COUNT - 5} more`, prompt: '' },
  { command: `# \u2713 All ${FREE_SKILL_COUNT} skills installed`, prompt: '' },
] as const;

/* ─── How It Works steps ─── */

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
      'Your agent reads each skill, its rules, patterns, and domain knowledge, and internalizes them.',
    icon: BrainCircuit,
    number: '02',
    title: 'Agent Learns',
  },
  {
    description:
      'Skills activate at exactly the right moment. Say "write a tweet" and the X skill takes over.',
    icon: Zap,
    number: '03',
    title: 'Create Content',
  },
  {
    description:
      'Inside Genfeed, skills use platform tools like create_post, generate_image, and rate_content for even better output.',
    icon: Package,
    number: '04',
    title: 'Better with Genfeed',
  },
];
