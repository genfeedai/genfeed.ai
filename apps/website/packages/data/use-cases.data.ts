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
    recommended: string;
    why: string;
  };
  cta: string;
}

export const useCases: UseCase[] = [
  {
    audience: 'Brands, agencies, personal brands launching virtual influencers',
    cta: 'Get Started',
    description:
      'Create AI influencers that post, engage, and grow audiences 24/7. Full creative control with zero risk of brand-damaging posts.',
    headline: 'Virtual Influencers That Post 24/7',
    painPoints: [
      'Human influencers are expensive and unpredictable',
      'Brand safety risks with real creators',
      'Content availability limited to working hours',
      'Scaling influencer programs is slow',
      'No control over messaging or personality',
    ],
    pricing: {
      recommended: 'Pro',
      why: '$499/month = AI avatar generation, voice cloning, automated content pipeline, and multi-platform publishing.',
    },
    results: [
      'Cost per influencer drops from $10K/mo to $99/mo',
      '24/7 always-on content availability',
      'Full brand safety and creative control',
      'Scale to unlimited virtual personas',
    ],
    slug: 'ai-influencers',
    solutions: [
      'Define persona, voice, visual style, and brand guidelines',
      'Generate photorealistic AI avatars for video and image content',
      'Clone any voice for authentic, on-brand audio',
      'Automated content generation and scheduling across all formats',
      'Publish to Instagram, TikTok, YouTube, and Twitter simultaneously',
    ],
    subtitle: 'AI-Powered Virtual Influencers',
    title: 'Genfeed for AI Influencers',
    workflow: [
      {
        description:
          'Set personality traits, brand voice, visual style, and content guidelines.',
        example: 'Fashion-forward, Gen Z voice, minimalist aesthetic',
        step: 1,
        title: 'Define Your Persona',
      },
      {
        description:
          'Create photorealistic AI avatars with customizable appearance.',
        example: 'AI avatar with custom look, expressions, and outfits',
        step: 2,
        title: 'Generate Your Avatar',
      },
      {
        description:
          'Set up automated content creation with AI-generated scripts and visuals.',
        example: '30 videos/month on autopilot',
        step: 3,
        title: 'Create Content Pipeline',
      },
      {
        description: 'Auto-publish across platforms with engagement agents.',
        example: 'Post to 4 platforms + auto-reply to comments',
        step: 4,
        title: 'Publish & Engage',
      },
    ],
  },
  {
    audience: 'YouTube creators, TikTokers, Instagram influencers',
    cta: 'Get Started',
    description:
      'Stop spending hours editing. Generate viral videos, thumbnails, and clips. Track what makes you money.',
    headline: 'Create AI Content That Converts',
    painPoints: [
      'Spending 10+ hours/week editing videos',
      'Running out of content ideas',
      'No idea which content drives revenue',
      "Can't scale beyond 3-5 posts per week",
      "Expensive tools that don't talk to each other",
    ],
    pricing: {
      recommended: 'Pro',
      why: '$499/month = 30 AI videos + 500 images. Perfect for creators posting daily.',
    },
    results: [
      '10x content output (3 posts/week → 30 posts/week)',
      'Track revenue per post, not just likes',
      'Save 15+ hours/week on editing',
      'Find winning content formats faster',
    ],
    slug: 'creators',
    solutions: [
      'Generate AI videos in minutes, not hours',
      'See trending topics before they blow up',
      'Track which content drives sales, not just likes',
      'Publish to all platforms from one dashboard',
      'All content types in one platform (no tool switching)',
    ],
    subtitle: 'YouTube, TikTok, Instagram Creators',
    title: 'Genfeed for Content Creators',
    workflow: [
      {
        description: "AI detects what's trending in your niche",
        example: 'Trending: "AI voice cloning tutorial"',
        step: 1,
        title: 'See Trending Topics',
      },
      {
        description: 'Create video, thumbnail, and caption in 3 clicks',
        example: 'AI video (8s) + thumbnail + optimized caption',
        step: 2,
        title: 'Generate Content',
      },
      {
        description: 'Post to TikTok, YouTube Shorts, Instagram Reels at once',
        example: 'One click → 3 platforms',
        step: 3,
        title: 'Publish Everywhere',
      },
      {
        description: 'See which videos drive actual sales/conversions',
        example: 'Video #42 drove $1,200 in sales',
        step: 4,
        title: 'Track Revenue',
      },
      {
        description: 'AI tells you what to post next',
        example: 'Post more "tutorial" content—it converts 3x better',
        step: 5,
        title: 'Optimize',
      },
    ],
  },
  {
    audience: 'Marketing agencies, content agencies, social media managers',
    cta: 'Get Started',
    description:
      'Create content for all your clients from one dashboard. Track performance, automate workflows, and scale without hiring.',
    headline: 'Manage 10+ Clients Without 10+ Tools',
    painPoints: [
      'Managing 10+ client accounts across different tools',
      'Clients asking "which post drove sales?"',
      'Team members using different tools/workflows',
      "Can't scale beyond 15-20 clients per team",
      'High tool costs eating into margins',
    ],
    pricing: {
      recommended: 'Scale',
      why: '$1,499/month includes 100 videos, 10 team seats, 5 brand kits. Perfect for agencies managing 5-15 clients.',
    },
    results: [
      'Manage 3x more clients with same team',
      'Reduce tool costs by 60% (consolidate 5+ tools)',
      'Show clients ROI, increase retention 40%',
      'Save 20+ hours/week per client',
    ],
    slug: 'agencies',
    solutions: [
      'Manage all clients from one dashboard',
      'Show clients exact ROI per post',
      'Team collaboration with approval workflows',
      'Automate recurring content (daily posts, weekly reports)',
      'White-label option for enterprise clients',
    ],
    subtitle: 'Content & Marketing Agencies',
    title: 'Genfeed for Agencies',
    workflow: [
      {
        description: 'Separate workspace per client, shared team access',
        example: 'Client A, Client B, Client C—all in one login',
        step: 1,
        title: 'Client Workspaces',
      },
      {
        description: 'Generate 30 days of content in one session',
        example: '30 AI videos + captions for Client A in 20 minutes',
        step: 2,
        title: 'Bulk Content Generation',
      },
      {
        description: 'Client reviews and approves before publishing',
        example: 'Send 10 videos → Client approves 8 → Auto-publish',
        step: 3,
        title: 'Approval Workflows',
      },
      {
        description: 'Show clients which content drives revenue',
        example: 'Monthly report: "Video #12 drove $5k in sales"',
        step: 4,
        title: 'Performance Dashboard',
      },
      {
        description: 'Set up recurring workflows, manage 50+ clients',
        example: 'Every Monday: Generate + post client content',
        step: 5,
        title: 'Automate & Scale',
      },
    ],
  },
  {
    audience: 'E-commerce brands, DTC companies, Shopify stores',
    cta: 'Get Started',
    description:
      'Generate product videos, lifestyle shots, and social ads at scale. Track which content drives purchases.',
    headline: 'Product Content at Scale',
    painPoints: [
      'Product photoshoots are expensive and slow',
      'Need content for dozens/hundreds of SKUs',
      "Can't A/B test creative fast enough",
      'No attribution from social content to purchases',
      'Seasonal content takes weeks to produce',
    ],
    pricing: {
      recommended: 'Scale',
      why: '$1,499/month includes 100 product videos, bulk generation, and purchase attribution tracking.',
    },
    results: [
      'Cut product content costs by 80%',
      'Generate content for 100+ SKUs per month',
      'A/B test 10x more creative variations',
      'Track content → purchase attribution',
    ],
    slug: 'ecommerce',
    solutions: [
      'Generate product videos and lifestyle images from product photos',
      'Bulk content generation for entire catalogs',
      'A/B test creative variations at scale',
      'Track which content drives actual purchases',
      'Auto-generate seasonal and promotional content',
    ],
    subtitle: 'E-Commerce & DTC Brands',
    title: 'Genfeed for E-Commerce',
    workflow: [
      {
        description: 'Upload product images, AI generates lifestyle content',
        example: 'Upload 10 product shots → 50 lifestyle videos',
        step: 1,
        title: 'Upload Products',
      },
      {
        description: 'AI creates videos, images, and ads for each product',
        example: 'Product video + carousel + story ad in minutes',
        step: 2,
        title: 'Generate Content',
      },
      {
        description: 'Post product content across all social channels',
        example: 'Instagram Shop + TikTok Shop + Facebook Ads',
        step: 3,
        title: 'Publish Everywhere',
      },
      {
        description: 'See which content drives add-to-carts and purchases',
        example: 'Video #8 drove 142 purchases ($12K revenue)',
        step: 4,
        title: 'Track Purchases',
      },
      {
        description: 'Double down on content that sells',
        example: 'Lifestyle videos convert 3x better → generate more',
        step: 5,
        title: 'Optimize & Scale',
      },
    ],
  },
  {
    audience: 'Marketing managers, CMOs, brand marketers, growth teams',
    cta: 'Get Started',
    description:
      'Stop guessing what content works. Generate, test, and scale content that converts—with full attribution.',
    headline: 'Content That Actually Drives Pipeline',
    painPoints: [
      "Content team can't keep up with demand",
      'No idea which content drives pipeline',
      'Expensive agencies with slow turnaround',
      "Can't test content ideas fast enough",
      'Marketing attribution is a black box',
    ],
    pricing: {
      recommended: 'Scale',
      why: '$1,499/month includes 100 videos, advanced analytics, and API access. Perfect for marketing teams running multi-channel campaigns.',
    },
    results: [
      'Cut content production costs by 70%',
      'Test 10x more content ideas per month',
      'Prove marketing ROI to leadership',
      'Scale from 5 posts/week to 30 posts/week',
    ],
    slug: 'marketers',
    solutions: [
      'Generate test content in minutes (A/B test 10x faster)',
      'Track revenue attribution per post',
      'In-house content creation (no agency dependency)',
      'Scale winning content formats instantly',
      'Full-funnel visibility (awareness → conversion)',
    ],
    subtitle: 'Brand Marketers & CMOs',
    title: 'Genfeed for Marketers',
    workflow: [
      {
        description: 'AI suggests content based on industry trends',
        example: 'Trending: "AI for B2B marketing"—create video?',
        step: 1,
        title: 'Content Ideation',
      },
      {
        description: 'Generate 10 variations, test in market',
        example: '10 video hooks → test on LinkedIn → find winner',
        step: 2,
        title: 'Rapid Testing',
      },
      {
        description: 'Post to LinkedIn, YouTube, X, newsletter',
        example: 'One video → 4 platforms in one click',
        step: 3,
        title: 'Multi-Channel Distribution',
      },
      {
        description: 'See which content drives demos, signups, revenue',
        example: 'Video #5 → 12 demo requests → $60k pipeline',
        step: 4,
        title: 'Attribution Tracking',
      },
      {
        description: 'Double down on content that converts',
        example: 'Video format A converts 5x → create 20 more',
        step: 5,
        title: 'Scale Winners',
      },
    ],
  },
  {
    audience: 'Solopreneurs, indie hackers, startup founders, solo devs',
    cta: 'Get Started',
    description:
      'Generate content, grow your audience, and track what converts—all while building your product.',
    headline: 'Build an Audience Without Hiring a Team',
    painPoints: [
      'No time for content (busy building product)',
      "Can't afford a content team or agency",
      'Posting sporadically, no consistency',
      "Don't know what content drives signups",
      'Overwhelmed by too many tools',
    ],
    pricing: {
      recommended: 'Pro',
      why: '$499/month = 30 AI videos + 500 images. Perfect for solo founders building in public.',
    },
    results: [
      'Post 5x more without extra time',
      'Grow audience while building product',
      'Track what content drives revenue',
      '30 studio-quality videos per month',
    ],
    slug: 'founders',
    solutions: [
      'Generate content in 10 minutes/day',
      'Automate posting schedule (set it and forget it)',
      'Track which content drives signups/revenue',
      'All-in-one platform (no tool switching)',
      'Self-host free or use managed cloud ($499/month)',
    ],
    subtitle: 'Solopreneurs & Startup Founders',
    title: 'Genfeed for Founders',
    workflow: [
      {
        description: '10 minutes/day = 30 posts/month',
        example: 'Generate 5 videos on Sunday → schedule for the week',
        step: 1,
        title: 'Quick Content Creation',
      },
      {
        description: 'Set schedule once, content posts automatically',
        example: 'Monday 9am: Post to X. Tuesday 11am: Post to LinkedIn.',
        step: 2,
        title: 'Automated Publishing',
      },
      {
        description: 'See which posts drive signups',
        example: 'Tweet #42 → 15 signups → $1,500 MRR',
        step: 3,
        title: 'Growth Tracking',
      },
      {
        description: 'Turn winning content into clips, threads, articles',
        example: 'Video did well → auto-generate article + thread',
        step: 4,
        title: 'Repurpose Winners',
      },
      {
        description: 'Audience grows while you build',
        example: '1,000 followers in 90 days, minimal effort',
        step: 5,
        title: 'Focus on Product',
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
