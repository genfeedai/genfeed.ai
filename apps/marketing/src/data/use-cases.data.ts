import type { PlanTier } from '@genfeedai/pricing';
import { PLAN_COPY } from '@genfeedai/pricing';

export interface UseCase {
  slug: string;
  title: string;
  subtitle: string;
  headline: string;
  description: string;
  audience: string;
  painPoints: string[];
  solutions: string[];
  workflow: {
    step: number;
    title: string;
    description: string;
    example: string;
  }[];
  results: string[];
  pricing: {
    /** Stable tier id; the display name is resolved via getPlanLabel at render. */
    recommended: PlanTier;
    why: string;
  };
}

export const useCases: UseCase[] = [
  {
    audience: 'Brands, agencies, personal brands launching virtual influencers',
    description:
      'Create a virtual persona, generate on-brand images and videos, then review and schedule posts for your connected channels.',
    headline: 'Create Content for Your Virtual Influencer',
    painPoints: [
      'Human influencers are expensive and unpredictable',
      'Brand safety risks with real creators',
      'Content availability limited to working hours',
      'Scaling influencer programs is slow',
      'No control over messaging or personality',
    ],
    pricing: {
      recommended: 'payg',
      why: `Start free with pay-per-output credits and pay only for what you generate.`,
    },
    results: [
      'Generate avatar content with pay-per-output credits',
      'Schedule approved content ahead of time',
      'Review drafts against your brand guidelines',
      'Reuse persona references across content drafts',
    ],
    slug: 'ai-influencers',
    solutions: [
      'Define persona, voice, visual style, and brand guidelines',
      'Generate photorealistic AI avatars for video and image content',
      'Create on-brand audio with voices you have permission to use',
      'Generate images and videos, then schedule approved posts',
      'Publish approved content to your connected channels',
    ],
    subtitle: 'Virtual influencers that stay on brand',
    title: 'Genfeed for AI Influencers',
    workflow: [
      {
        description:
          'Set personality traits, brand voice, visual style, and content guidelines.',
        example: 'Fashion-forward, Gen Z voice, minimalist aesthetic',
        step: 1,
        title: 'Define your persona',
      },
      {
        description:
          'Create photorealistic AI avatars with customizable appearance.',
        example: 'AI avatar with custom look, expressions, and outfits',
        step: 2,
        title: 'Generate your avatar',
      },
      {
        description:
          'Set up automated content creation with AI-generated scripts and visuals.',
        example: 'A recurring series of avatar videos for review',
        step: 3,
        title: 'Create content pipeline',
      },
      {
        description:
          'Review drafts and schedule posts to your connected channels.',
        example: 'Approve a campaign and schedule each channel’s posts',
        step: 4,
        title: 'Review & publish',
      },
    ],
  },
  {
    audience: 'YouTube creators, TikTokers, Instagram influencers',
    description:
      'Turn your ideas into video drafts, thumbnails and clips. Review them, publish to connected channels and compare available performance data.',
    headline: 'Create Content for Your Channels',
    painPoints: [
      'Spending 10+ hours/week editing videos',
      'Running out of content ideas',
      'No idea which content drives revenue',
      "Can't scale beyond 3-5 posts per week",
      "Expensive tools that don't talk to each other",
    ],
    pricing: {
      recommended: 'payg',
      why: `Start free with pay-per-output credits and pay only for what you generate.`,
    },
    results: [
      'Create variations from the same brief',
      'Compare available performance data across published posts',
      'Reuse references and brand context across drafts',
      'Find the content formats that worked for you',
    ],
    slug: 'creators',
    solutions: [
      'Generate videos from a short brief',
      'See what is trending in your niche',
      'Compare available performance data for published content',
      'Publish to supported channels from one dashboard',
      'All content types in one platform (no tool switching)',
    ],
    subtitle: 'YouTube, TikTok, Instagram Creators',
    title: 'Genfeed for Content Creators',
    workflow: [
      {
        description: 'Start from the trends Genfeed has observed in your niche',
        example: 'Trending: "AI voice cloning tutorial"',
        step: 1,
        title: 'See trending topics',
      },
      {
        description:
          'Ask your agent for the video and thumbnail, then draft the caption with it',
        example: 'A short video, a thumbnail and a caption, ready for review',
        step: 2,
        title: 'Generate content',
      },
      {
        description: 'Schedule to TikTok, YouTube Shorts and Instagram Reels',
        example: 'One video, scheduled to three platforms',
        step: 3,
        title: 'Publish everywhere',
      },
      {
        description:
          'Compare views and engagement across your published videos',
        example: 'Compare a tutorial video with a product walkthrough',
        step: 4,
        title: 'Track performance',
      },
      {
        description: 'Pick the next brief from what worked',
        example: 'Use the stronger-performing format as the next brief',
        step: 5,
        title: 'Optimize',
      },
    ],
  },
  {
    audience:
      'Creative agencies, content teams, paid-social agencies and social media managers',
    description:
      'Create content and ad variations for your clients, keep each client’s brand context and assets organized and review the work before publishing. Build a repeatable production workflow for your team.',
    headline: 'Produce more client-ready creative with your team',
    painPoints: [
      'Every client needs a steady supply of fresh content and ad variations',
      'Brand guidelines and source assets are scattered across tools',
      'Producing another round of creative tests takes time away from client work',
      'Drafts, revisions and publishing handoffs are difficult to coordinate',
      'Adding clients adds production work faster than the team can absorb it',
    ],
    pricing: {
      recommended: 'scale',
      why: `${PLAN_COPY.scale.name} supports collaboration and multi-brand workspaces for recurring client production. Add credits as your client production grows.`,
    },
    results: [
      'Reuse each client’s brand context and assets',
      'Prepare multiple creative angles for review',
      'Keep drafts and publishing in the same workspace',
      'Compare available performance for published content',
      'Repeat production workflows across client brands',
    ],
    slug: 'agencies',
    solutions: [
      'Keep client brands and their content organized in shared workspaces',
      'Generate image, video and copy variations from a campaign brief',
      'Review drafts and refine the creative before publishing',
      'Schedule approved posts to the client’s supported connected accounts',
      'Use available views and engagement to inform the next batch',
    ],
    subtitle: 'Creative, Content & Paid Social Agencies',
    title: 'Genfeed for Agencies',
    workflow: [
      {
        description: 'Add the client’s brand context and source assets',
        example:
          'Keep each client’s writing, product details and visuals together',
        step: 1,
        title: 'Set up the client brand',
      },
      {
        description: 'Turn a campaign brief into creative variations',
        example:
          'Explore different hooks, visuals and copy for the same product',
        step: 2,
        title: 'Create the next batch',
      },
      {
        description: 'Review the drafts and refine the work that needs changes',
        example:
          'Check brand fit, edit the copy and select the assets to publish',
        step: 3,
        title: 'Review and refine',
      },
      {
        description:
          'Schedule approved content to supported connected accounts',
        example: 'Choose the client account and publishing time for each post',
        step: 4,
        title: 'Publish the approved work',
      },
      {
        description: 'Use available post performance to inform the next brief',
        example: 'Compare views and engagement across the published batch',
        step: 5,
        title: 'Plan the next round',
      },
    ],
  },
  {
    audience: 'E-commerce brands, DTC companies, Shopify stores',
    description:
      'Generate product videos, lifestyle shots and social ad drafts. Compare available views and engagement after publishing.',
    headline: 'Product content for every SKU',
    painPoints: [
      'Product photoshoots are expensive and slow',
      'Need content for dozens/hundreds of SKUs',
      "Can't A/B test creative fast enough",
      'No attribution from social content to purchases',
      'Seasonal content takes weeks to produce',
    ],
    pricing: {
      recommended: 'scale',
      why: `${PLAN_COPY.scale.name} adds managed billing, brand workspaces, bulk generation workflows, and available publishing analytics.`,
    },
    results: [
      'Create product content from existing references',
      'Generate drafts for multiple products',
      'Prepare creative variations for your ad tests',
      'Compare available product-content performance',
    ],
    slug: 'ecommerce',
    solutions: [
      'Generate product videos and lifestyle images from product photos',
      'Bulk content generation for entire catalogs',
      'A/B test creative variations at scale',
      'Compare available performance across product content',
      'Auto-generate seasonal and promotional content',
    ],
    subtitle: 'E-commerce & DTC brands',
    title: 'Genfeed for E-Commerce',
    workflow: [
      {
        description:
          'Give your agent the product images and brief it on the campaign; it creates the lifestyle videos and images',
        example: 'Product shots in, lifestyle videos and images out',
        step: 1,
        title: 'Upload products',
      },
      {
        description: 'AI creates videos, images, and ads for each product',
        example: 'A product video, a carousel and a story ad for review',
        step: 2,
        title: 'Generate content',
      },
      {
        description: 'Post product content across all social channels',
        example: 'Instagram Shop + TikTok Shop + Facebook Ads',
        step: 3,
        title: 'Publish everywhere',
      },
      {
        description:
          'Compare available views and engagement across product posts',
        example: 'Compare product video views and engagement',
        step: 4,
        title: 'Track performance',
      },
      {
        description: 'Reuse the formats your audience engages with',
        example:
          'Use the stronger-performing format for your next product brief',
        step: 5,
        title: 'Optimize & scale',
      },
    ],
  },
  {
    audience: 'Marketing managers, CMOs, brand marketers, growth teams',
    description:
      'Create campaign drafts, publish approved content and compare available performance data to plan your next brief.',
    headline: 'Create Content for Your Campaign',
    painPoints: [
      "Content team can't keep up with demand",
      'No idea which content drives pipeline',
      'Expensive agencies with slow turnaround',
      "Can't test content ideas fast enough",
      'Marketing attribution is a black box',
    ],
    pricing: {
      recommended: 'scale',
      why: `${PLAN_COPY.scale.name} adds shared workspaces, advanced analytics, and production support for marketing teams running multi-channel campaigns.`,
    },
    results: [
      'Reuse campaign briefs across content drafts',
      'Create multiple angles from one campaign brief',
      'Compare available campaign performance data',
      'Schedule approved content ahead of time',
    ],
    slug: 'marketers',
    solutions: [
      'Generate creative variations for testing',
      'Compare available post performance',
      'In-house content creation (no agency dependency)',
      'Reuse formats from previous campaigns',
      'Review available publishing and campaign metrics',
    ],
    subtitle: 'Brand marketers & CMOs',
    title: 'Genfeed for Marketers',
    workflow: [
      {
        description: 'AI suggests content based on industry trends',
        example: 'Trending: "AI for B2B marketing". Create video?',
        step: 1,
        title: 'Content ideation',
      },
      {
        description:
          'Ask your agent for ten variations and test them in market',
        example: 'Ten video hooks to test on LinkedIn',
        step: 2,
        title: 'Rapid testing',
      },
      {
        description: 'Post to LinkedIn, YouTube, X, newsletter',
        example: 'One video, scheduled to four platforms',
        step: 3,
        title: 'Multi-channel distribution',
      },
      {
        description:
          'Review available views and engagement across campaign posts',
        example: 'Compare performance across campaign angles',
        step: 4,
        title: 'Campaign performance',
      },
      {
        description: 'Reuse the formats that perform well for your audience',
        example: 'Use the stronger-performing format for the next batch',
        step: 5,
        title: 'Scale winners',
      },
    ],
  },
  {
    audience: 'Developers, indie founders and small product teams',
    description:
      'Turn product updates, demos and expertise into content that gives people a reason to follow your work. Review drafts, publish consistently and join relevant conversations while you keep building.',
    headline: 'Build an audience around what you ship',
    painPoints: [
      'You ship useful work, but few people hear about it',
      'Writing posts and preparing visuals compete with product time',
      'Launch announcements happen once, then the account goes quiet',
      'Your buyers and peers are talking, but you struggle to join consistently',
      'You need to see which posts get a response before planning the next batch',
    ],
    pricing: {
      recommended: 'payg',
      why: `Start free with pay-per-output credits and pay only for what you generate.`,
    },
    results: [
      'Explain your product through posts, threads and visuals',
      'Prepare useful replies to conversations you select',
      'Keep your writing samples and brand context with your drafts',
      'Schedule approved content to your supported connected accounts',
      'Review available post performance before your next update',
    ],
    slug: 'founders',
    solutions: [
      'Create posts and visuals from product updates, demos and notes',
      'Prepare reply drafts for relevant questions and conversations',
      'Review and edit content in your voice before publishing',
      'Schedule a batch of approved posts at times you choose',
      'Compare available views and engagement for your published content',
    ],
    subtitle: 'Developers & founders building distribution',
    title: 'Genfeed for Founders',
    workflow: [
      {
        description: 'Start with a product update, demo or customer question',
        example: 'Explain what changed, who it helps and why it matters',
        step: 1,
        title: 'Share what you are building',
      },
      {
        description:
          'Create posts, threads and visuals using your brand context',
        example: 'Turn a release update into a post and a supporting visual',
        step: 2,
        title: 'Prepare your content',
      },
      {
        description: 'Edit the drafts and schedule the posts you approve',
        example: 'Choose the account, content and publishing time',
        step: 3,
        title: 'Review and publish',
      },
      {
        description:
          'Choose a relevant conversation and prepare a useful reply',
        example: 'Answer a question with an example from your own experience',
        step: 4,
        title: 'Join the conversation',
      },
      {
        description:
          'Review available views and engagement before the next batch',
        example: 'Build on the topics that get a substantive response',
        step: 5,
        title: 'Use what you learn',
      },
    ],
  },
];

export function getUseCaseBySlug(slug: string): UseCase | undefined {
  return useCases.find((uc) => uc.slug === slug);
}

export function getAllUseCaseSlugs(): string[] {
  return useCases.map((uc) => uc.slug);
}
