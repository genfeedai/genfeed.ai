import type { IconType } from 'react-icons';
import {
  FaInstagram,
  FaLinkedin,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import {
  LuBrainCircuit,
  LuCode,
  LuGitBranch,
  LuImage,
  LuLayoutTemplate,
  LuMegaphone,
  LuNewspaper,
  LuPackage,
  LuPalette,
  LuPenTool,
  LuRocket,
  LuSearch,
  LuShuffle,
  LuSparkles,
  LuTarget,
  LuTerminal,
  LuTrendingUp,
  LuUsers,
  LuWand,
  LuZap,
} from 'react-icons/lu';

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
        icon: FaXTwitter,
        name: 'X Content Creator',
        slug: 'x-content-creator',
      },
      {
        description:
          'Captions, carousels, Reels scripts, and Story sequences with hashtag strategy.',
        icon: FaInstagram,
        name: 'Instagram Creator',
        slug: 'instagram-content-creator',
      },
      {
        description:
          'Professional posts, articles, carousels, and newsletter editions.',
        icon: FaLinkedin,
        name: 'LinkedIn Creator',
        slug: 'linkedin-content-creator',
      },
      {
        description:
          'Titles, descriptions, tags, chapters, thumbnail briefs, and Shorts scripts.',
        icon: FaYoutube,
        name: 'YouTube Creator',
        slug: 'youtube-content-creator',
      },
      {
        description:
          'Newsletter editions with subject line A/B variants and editorial structure.',
        icon: LuNewspaper,
        name: 'Newsletter Creator',
        slug: 'newsletter-creator',
      },
      {
        description:
          'SEO-optimized blog posts, guides, case studies, and pillar pages.',
        icon: LuPenTool,
        name: 'Blog Creator',
        slug: 'blog-content-creator',
      },
    ],
    subtitle:
      'Platform-native content with hooks, hashtags, SEO, and formatting — ready to post.',
    title: 'Create for Every Platform',
  },
  {
    id: 'optimization',
    label: 'Content Optimization',
    skills: [
      {
        description:
          'SEO score (0-100) with keyword placement, readability, meta optimization, and schema markup.',
        icon: LuSearch,
        name: 'SEO Optimizer',
        slug: 'content-seo-optimizer',
      },
      {
        description:
          'Repurpose 1 piece of content into 15+ derivatives across every platform.',
        icon: LuShuffle,
        name: 'Content Atomizer',
        slug: 'content-atomizer',
      },
      {
        description:
          '6-dimension quality scoring — clarity, voice, hook, CTA, platform fit, accuracy.',
        icon: LuSparkles,
        name: 'Content Reviewer',
        slug: 'content-reviewer',
      },
    ],
    subtitle:
      'SEO scoring, quality review, and cross-platform repurposing in one pass.',
    title: 'Optimize Before You Publish',
  },
  {
    id: 'image-visual',
    label: 'Image & Visual',
    skills: [
      {
        description:
          'Optimized image prompts with model-specific tips for Flux, DALL-E, Midjourney, and Imagen.',
        icon: LuImage,
        name: 'Image Prompt Engineer',
        slug: 'image-prompt-engineer',
      },
      {
        description:
          'Pick the right model for the job — face consistency, speed, quality, cost tiers.',
        icon: LuZap,
        name: 'Model Selector',
        slug: 'model-selector',
      },
      {
        description:
          'Visual brand identity — colors, typography, composition rules, and prompt presets.',
        icon: LuPalette,
        name: 'Visual Brand Kit',
        slug: 'visual-brand-kit',
      },
    ],
    subtitle:
      'Optimized prompts for Flux, DALL-E, Midjourney, Imagen, and more — with model selection intelligence.',
    title: 'Prompt Any Model',
  },
  {
    id: 'advertising',
    label: 'Advertising',
    skills: [
      {
        description:
          'Ad copy with PAS, AIDA, BAB, StoryBrand frameworks — variants for every platform.',
        icon: LuMegaphone,
        name: 'Ad Copy Creator',
        slug: 'ad-copy-creator',
      },
      {
        description:
          'KPI benchmarks, creative fatigue detection, budget allocation, scaling criteria.',
        icon: LuTrendingUp,
        name: 'Ad Performance Analyzer',
        slug: 'ad-performance-analyzer',
      },
    ],
    subtitle:
      'Direct response frameworks and performance analysis for Meta, Google, LinkedIn, and TikTok.',
    title: 'Ads That Convert',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    skills: [
      {
        description:
          'Content pillars, posting cadence, platform mix, monthly calendar, and KPI targets.',
        icon: LuTarget,
        name: 'Content Strategist',
        slug: 'content-strategist',
      },
      {
        description:
          'Competitive audit — platforms, frequency, engagement, gaps, and differentiation.',
        icon: LuUsers,
        name: 'Competitor Analyzer',
        slug: 'competitor-analyzer',
      },
    ],
    subtitle:
      'Content calendars, pillar strategy, and competitive intelligence.',
    title: 'Plan Before You Create',
  },
  {
    id: 'platform',
    label: 'Platform & Dev',
    skills: [
      {
        description:
          'Create visual AI workflows from natural language descriptions.',
        icon: LuGitBranch,
        name: 'Workflow Creator',
        slug: 'workflow-creator',
      },
      {
        description: 'Custom nodes using the Genfeed SDK fluent builder API.',
        icon: LuCode,
        name: 'Node Creator',
        slug: 'node-creator',
      },
      {
        description: 'AI image and video prompt generation with style presets.',
        icon: LuWand,
        name: 'Prompt Generator',
        slug: 'prompt-generator',
      },
      {
        description: 'Get started with Genfeed in under 10 minutes.',
        icon: LuRocket,
        name: 'Onboarding',
        slug: 'onboarding',
      },
      {
        description: 'Validate feature scope — core vs cloud.',
        icon: LuLayoutTemplate,
        name: 'Scope Validator',
        slug: 'scope-validator',
      },
      {
        description: 'Connect AI agents to Genfeed via MCP.',
        icon: LuBrainCircuit,
        name: 'OpenClaw Integration',
        slug: 'openclaw-integration',
      },
    ],
    subtitle:
      'Workflow creation, custom nodes, and agent integration for developers.',
    title: 'Build with Genfeed',
  },
];

/* ─── Premium registry types ─── */

export interface SkillRegistryEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  s3Key: string;
  category: string;
}

export interface SkillRegistry {
  skills: SkillRegistryEntry[];
  bundlePrice: number;
  updatedAt: string;
}

/* ─── Stats ─── */

export const STATS = [
  { label: 'Skills', value: '22' },
  { label: 'Platforms', value: '6' },
  { label: 'Open Source', value: '100%' },
  { label: 'Install Time', value: '<10s' },
];

/* ─── Terminal demo commands ─── */

export const TERMINAL_COMMANDS = [
  { command: 'npx skills add genfeedai/skills', prompt: '~' },
  { command: 'Installing 22 skills from genfeedai/skills...', prompt: '' },
  { command: '\u2713 x-content-creator', prompt: '' },
  { command: '\u2713 instagram-content-creator', prompt: '' },
  { command: '\u2713 content-seo-optimizer', prompt: '' },
  { command: '\u2713 image-prompt-engineer', prompt: '' },
  { command: '\u2713 ad-copy-creator', prompt: '' },
  { command: '... and 17 more', prompt: '' },
  { command: '# \u2713 All 22 skills installed', prompt: '' },
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
    description:
      'One command installs all 22 skills into your Claude Code workspace.',
    icon: LuTerminal,
    number: '01',
    title: 'Install',
  },
  {
    description:
      'Your agent reads each skill — its rules, patterns, and domain knowledge — and internalizes them.',
    icon: LuBrainCircuit,
    number: '02',
    title: 'Agent Learns',
  },
  {
    description:
      'Skills activate at exactly the right moment. Say "write a tweet" and the X skill takes over.',
    icon: LuZap,
    number: '03',
    title: 'Create Content',
  },
  {
    description:
      'Inside Genfeed, skills use platform tools — create_post, generate_image, rate_content — for even better output.',
    icon: LuPackage,
    number: '04',
    title: 'Better with Genfeed',
  },
];
