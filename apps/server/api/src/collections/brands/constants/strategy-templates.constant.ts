export interface StrategyTemplate {
  name: string;
  description: string;
  contentTypes: string[];
  platforms: string[];
  frequency: string;
  goals: string[];
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    contentTypes: ['thread', 'carousel', 'short-video'],
    description:
      'Build a loyal audience with daily posts optimized for engagement and follower growth.',
    frequency: 'daily',
    goals: ['follower-growth', 'engagement', 'brand-awareness'],
    name: 'Growth Engine',
    platforms: ['twitter', 'instagram', 'linkedin'],
  },
  {
    contentTypes: ['article', 'thread', 'newsletter'],
    description:
      'Establish authority in your niche through long-form educational content.',
    frequency: '3x-per-week',
    goals: ['thought-leadership', 'seo', 'lead-generation'],
    name: 'Thought Leadership',
    platforms: ['linkedin', 'twitter', 'blog'],
  },
  {
    contentTypes: ['short-video', 'reel', 'story'],
    description:
      'Maximize reach with short-form video content across visual platforms.',
    frequency: 'daily',
    goals: ['viral-reach', 'brand-awareness', 'engagement'],
    name: 'Viral Video',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
  {
    contentTypes: ['article', 'case-study', 'whitepaper'],
    description:
      'Drive qualified leads through targeted content and conversion-optimized posts.',
    frequency: '2x-per-week',
    goals: ['lead-generation', 'conversion', 'authority'],
    name: 'Lead Generation',
    platforms: ['linkedin', 'blog', 'twitter'],
  },
  {
    contentTypes: ['story', 'post', 'carousel'],
    description:
      'Foster deeper connections with your existing audience through community-focused content.',
    frequency: 'daily',
    goals: ['community-building', 'retention', 'engagement'],
    name: 'Community Builder',
    platforms: ['instagram', 'twitter', 'discord'],
  },
  {
    contentTypes: ['product-post', 'review', 'tutorial'],
    description:
      'Showcase products and drive sales with commerce-focused content.',
    frequency: '3x-per-week',
    goals: ['sales', 'product-awareness', 'conversion'],
    name: 'E-Commerce',
    platforms: ['instagram', 'tiktok', 'pinterest'],
  },
];
