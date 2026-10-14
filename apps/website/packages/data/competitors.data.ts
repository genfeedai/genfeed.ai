export interface Competitor {
  slug: string;
  name: string;
  tagline: string;
  logo?: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  genfeedAdvantages: string[];
  comparisonTable: {
    feature: string;
    competitor: string | boolean;
    genfeed: string | boolean;
  }[];
  whenToUseCompetitor: string;
  whenToUseGenFeed: string;
  targetAudience: string;
}

export const competitors: Competitor[] = [
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: false, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$144-912',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'All content types (video, image, voice, articles)',
      'Built-in publishing to all platforms',
      'Revenue tracking & attribution',
      'Premium output quotas (30 videos/mo for $499)',
      'Team collaboration & workflows',
    ],
    name: 'Runway',
    pricing: '$12-76/month (limited generations)',
    slug: 'runway',
    strengths: [
      'High-quality video generation',
      'Professional video editing tools',
      'Advanced AI models',
    ],
    tagline: 'AI-powered video editing and generation',
    targetAudience: 'Video editors, filmmakers, creative professionals',
    weaknesses: [
      'Video-only (no images, articles, voice)',
      'No publishing tools',
      'No analytics or ROI tracking',
      'Expensive for high volume',
      'No team collaboration',
    ],
    whenToUseCompetitor:
      'You only need video generation and advanced editing features',
    whenToUseGenFeed:
      'You need full content creation (video + image + voice + articles), publishing, and ROI tracking',
  },
  {
    comparisonTable: [
      { competitor: 'Limited', feature: 'AI Video Generation', genfeed: true },
      { competitor: 'Basic', feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      { competitor: 'Basic', feature: 'Article Writing', genfeed: true },
      {
        competitor: 'Limited',
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$120',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Advanced AI generation (video, voice, avatars)',
      'Built-in publishing & scheduling',
      'Revenue attribution tracking',
      'Automation workflows',
      'Built for content creators, not designers',
    ],
    name: 'Canva',
    pricing: '$120/year (limited AI features)',
    slug: 'canva',
    strengths: [
      'Easy-to-use design tools',
      'Huge template library',
      'Affordable for basic use',
    ],
    tagline: 'Design platform for graphics and videos',
    targetAudience: 'Designers, marketers, small businesses',
    weaknesses: [
      'Limited AI video generation',
      'No content publishing',
      'No analytics or attribution',
      'Manual workflow (no automation)',
      'Basic AI features (extra cost)',
    ],
    whenToUseCompetitor: 'You need design templates and manual editing tools',
    whenToUseGenFeed:
      'You need AI-powered content generation, publishing, and performance tracking',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Clip Extraction', genfeed: true },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: false, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$348-1548',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Clip extraction PLUS video generation',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue tracking & attribution',
      'Team collaboration & automation',
    ],
    name: 'Opus Clip',
    pricing: '$29-129/month',
    slug: 'opus-clip',
    strengths: [
      'Great at extracting viral clips',
      'Auto-captions and subtitles',
      'Viral score prediction',
    ],
    tagline: 'AI-powered clip extraction from long videos',
    targetAudience: 'Podcasters, YouTube creators, video editors',
    weaknesses: [
      'Clip extraction only (no generation)',
      'No publishing tools',
      'No other content types',
      'No team features',
      'No ROI tracking',
    ],
    whenToUseCompetitor:
      'You only need clip extraction from existing long-form content',
    whenToUseGenFeed:
      'You need clip extraction PLUS content generation, publishing, and analytics',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Article Writing', genfeed: true },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$588-1500',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Articles PLUS video, image, voice, clips',
      'Built-in publishing & scheduling',
      'Revenue attribution',
      'All content types in one platform',
      'Better pricing for volume',
    ],
    name: 'Jasper',
    pricing: '$49-125/month',
    slug: 'jasper',
    strengths: [
      'Strong AI writing quality',
      'Marketing-focused templates',
      'SEO optimization',
    ],
    tagline: 'AI writing assistant for marketing',
    targetAudience: 'Content marketers, copywriters, bloggers',
    weaknesses: [
      'Text-only (no video, image, voice)',
      'No publishing tools',
      'No analytics',
      'Expensive for high volume',
      'No visual content',
    ],
    whenToUseCompetitor:
      'You only need AI writing for blogs and marketing copy',
    whenToUseGenFeed:
      'You need articles PLUS video, images, and full publishing workflow',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Social Media Scheduling', genfeed: true },
      { competitor: false, feature: 'AI Content Generation', genfeed: true },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: 'Basic', feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$72-1440',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI content generation built-in',
      'Publishing PLUS creation in one platform',
      'Revenue tracking & attribution',
      'Automation workflows',
      'All content types (not just scheduling)',
    ],
    name: 'Buffer',
    pricing: '$6-120/month',
    slug: 'buffer',
    strengths: [
      'Great scheduling tool',
      'Multi-platform posting',
      'Basic analytics',
    ],
    tagline: 'Social media scheduling and analytics',
    targetAudience: 'Social media managers, agencies, brands',
    weaknesses: [
      'No content generation (BYO content)',
      'No AI features',
      'Basic analytics only',
      'No revenue attribution',
      'Manual content creation',
    ],
    whenToUseCompetitor:
      'You already have content and just need a scheduling tool',
    whenToUseGenFeed:
      'You need AI content generation + publishing + analytics in one platform',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Video Editing', genfeed: 'Basic' },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      {
        competitor: 'Voice only',
        feature: 'AI Voice & Avatars',
        genfeed: true,
      },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$144-288',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Generation + editing in one platform',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue attribution',
      'Automation workflows',
    ],
    name: 'Descript',
    pricing: '$12-24/month',
    slug: 'descript',
    strengths: [
      'Transcript-based video editing',
      'Good for podcasts',
      'AI voice cloning',
    ],
    tagline: 'AI-powered video and podcast editing',
    targetAudience: 'Podcasters, video editors, content creators',
    weaknesses: [
      'Editing-focused (not generation)',
      'No image or article creation',
      'No publishing tools',
      'No analytics',
      'Manual workflow',
    ],
    whenToUseCompetitor: 'You need advanced transcript-based video editing',
    whenToUseGenFeed:
      'You need AI content generation, publishing, and performance tracking',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Avatar Videos', genfeed: true },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$264-708',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI avatar videos PLUS all other content types',
      'Built-in publishing to all platforms',
      'Revenue tracking & attribution',
      'Automation workflows',
      'Not limited to avatar-style videos',
    ],
    name: 'Synthesia',
    pricing: '$22-59/month',
    slug: 'synthesia',
    strengths: [
      'High-quality AI avatar videos',
      'Multi-language support (120+ languages)',
      'Enterprise-grade compliance',
    ],
    tagline: 'AI avatar video generation for enterprise',
    targetAudience:
      'Enterprise L&D teams, corporate communications, training departments',
    weaknesses: [
      'Avatar videos only (no other content types)',
      'No publishing or scheduling tools',
      'No analytics or ROI tracking',
      'Limited creative flexibility',
      'No image or article creation',
    ],
    whenToUseCompetitor:
      'You need corporate training videos with AI avatars and multi-language support',
    whenToUseGenFeed:
      'You need diverse content creation (video + image + articles), publishing, and performance analytics',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Avatar Videos', genfeed: true },
      { competitor: 'Basic', feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$288-576',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'All content types beyond avatar videos',
      'Built-in publishing & scheduling',
      'Revenue attribution tracking',
      'Automation workflows',
      'Full content creation pipeline',
    ],
    name: 'HeyGen',
    pricing: '$24-48/month',
    slug: 'heygen',
    strengths: [
      'Realistic AI avatars and lip-sync',
      'Video translation with voice cloning',
      'Quick avatar video creation',
    ],
    tagline: 'AI video generation with realistic avatars',
    targetAudience:
      'Marketers, sales teams, e-learning creators, global businesses',
    weaknesses: [
      'Primarily avatar-based videos',
      'No publishing tools',
      'No analytics or attribution',
      'No image or article creation',
      'Limited creative video styles',
    ],
    whenToUseCompetitor:
      'You need realistic avatar videos and video translation with lip-sync',
    whenToUseGenFeed:
      'You need full content creation (video + image + articles), publishing, and ROI tracking',
  },
  {
    comparisonTable: [
      {
        competitor: true,
        feature: 'Script-to-Video',
        genfeed: true,
      },
      { competitor: 'Basic', feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: false, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$228-468',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI-generated videos, not just stock footage assembly',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue attribution',
      'Automation workflows',
    ],
    name: 'Pictory',
    pricing: '$19-39/month',
    slug: 'pictory',
    strengths: [
      'Easy script-to-video conversion',
      'Blog-to-video repurposing',
      'Auto-captioning and summarization',
    ],
    tagline: 'AI video creation from scripts and articles',
    targetAudience: 'Bloggers, content marketers, small businesses',
    weaknesses: [
      'Stock footage based (no AI generation)',
      'No publishing tools',
      'No analytics or ROI tracking',
      'Limited creative control',
      'No image or article creation',
    ],
    whenToUseCompetitor:
      'You need quick stock-footage videos from existing blog posts or scripts',
    whenToUseGenFeed:
      'You need AI-generated content across all formats with publishing and analytics',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Video Editing', genfeed: 'Basic' },
      { competitor: 'Basic', feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$180-360',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI content generation, not just template editing',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue attribution',
      'Automation workflows',
    ],
    name: 'InVideo',
    pricing: '$15-30/month',
    slug: 'invideo',
    strengths: [
      'Large template library (5000+)',
      'Easy drag-and-drop editor',
      'Text-to-video with AI',
    ],
    tagline: 'AI-powered video editing and creation platform',
    targetAudience:
      'Small businesses, social media managers, beginner video creators',
    weaknesses: [
      'Template-based (limited AI generation)',
      'No publishing or scheduling',
      'No analytics or ROI tracking',
      'No image or article creation',
      'Watermarks on free plan',
    ],
    whenToUseCompetitor:
      'You need template-based video editing with a drag-and-drop interface',
    whenToUseGenFeed:
      'You need AI-powered content generation, multi-platform publishing, and analytics',
  },
  {
    comparisonTable: [
      {
        competitor: true,
        feature: 'Blog-to-Video',
        genfeed: true,
      },
      { competitor: 'Basic', feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: 'Basic', feature: 'ROI Tracking', genfeed: true },
      { competitor: true, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$348-1788',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI-generated content, not just stock footage assembly',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue attribution tracking',
      'Automation workflows for scale',
    ],
    name: 'Lumen5',
    pricing: '$29-149/month',
    slug: 'lumen5',
    strengths: [
      'Strong blog-to-video conversion',
      'Brand kit management',
      'Marketing-focused templates',
    ],
    tagline: 'AI video creation platform for marketers',
    targetAudience:
      'Marketing teams, enterprise content teams, social media managers',
    weaknesses: [
      'Stock footage based (no AI generation)',
      'No publishing tools',
      'Limited analytics',
      'No image or article creation',
      'Expensive at higher tiers',
    ],
    whenToUseCompetitor:
      'You need blog-to-video conversion with brand management for marketing teams',
    whenToUseGenFeed:
      'You need AI content generation across all formats with publishing and performance tracking',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Video Editing', genfeed: 'Basic' },
      { competitor: false, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      { competitor: false, feature: 'Team Collaboration', genfeed: true },
      { competitor: false, feature: 'Automation Workflows', genfeed: true },
      {
        competitor: 'Free-$96',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'AI content generation, not just editing',
      'All content types (video, image, voice, articles)',
      'Built-in publishing & scheduling',
      'Revenue attribution tracking',
      'Automation workflows for scale',
    ],
    name: 'CapCut',
    pricing: 'Free-$7.99/month',
    slug: 'capcut',
    strengths: [
      'Free and powerful video editor',
      'Excellent effects and transitions',
      'TikTok-optimized templates',
    ],
    tagline: 'Free video editing app by ByteDance',
    targetAudience:
      'TikTok creators, beginner video editors, social media enthusiasts',
    weaknesses: [
      'Editing only (no AI generation)',
      'No publishing or scheduling',
      'No analytics or ROI tracking',
      'No image or article creation',
      'No team collaboration features',
    ],
    whenToUseCompetitor:
      'You need a free, powerful video editor for TikTok and social media clips',
    whenToUseGenFeed:
      'You need AI content generation, multi-platform publishing, analytics, and automation',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'Social Media Scheduling', genfeed: true },
      {
        competitor: 'Monthly allowance',
        feature: 'AI Content Generation',
        genfeed: true,
      },
      {
        competitor: 'Monthly allowance',
        feature: 'AI Video Generation',
        genfeed: true,
      },
      {
        competitor: 'Higher plans',
        feature: 'AI Image Generation',
        genfeed: true,
      },
      { competitor: false, feature: 'AI Voice & Avatars', genfeed: true },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: true,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      {
        competitor: 'Channel analytics',
        feature: 'ROI Tracking',
        genfeed: true,
      },
      {
        competitor: 'Team plan and above',
        feature: 'Team Collaboration',
        genfeed: true,
      },
      { competitor: true, feature: 'Automation Workflows', genfeed: true },
      { competitor: true, feature: 'Open source and self-host', genfeed: true },
      {
        competitor: '$348-1188 or self-host',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Generation is the product, not a monthly media allowance',
      'Video, image, voice, and articles in one workspace',
      'Review before anything publishes',
      'Open source and self-hostable, same as Postiz',
      'Connected-channel analytics after publish',
    ],
    name: 'Postiz',
    pricing: '$29-99/month, or self-host',
    slug: 'postiz',
    strengths: [
      'Open-source scheduler under AGPL-3.0',
      'Posts to 30+ networks, including Bluesky and Mastodon',
      'MCP, CLI, and API on every hosted plan',
    ],
    tagline: 'Open-source social scheduling with an agent copilot',
    targetAudience:
      'Creators, agencies, and teams who already have content to schedule',
    weaknesses: [
      'Scheduling comes first; generation is a capped allowance',
      'Standard includes 3 AI videos a month and no AI images',
      'No voice, avatar, or long-form article studio',
      'Analytics are engagement counts, not revenue attribution',
    ],
    whenToUseCompetitor:
      'You already produce the content and want an open-source scheduler that agents can post through',
    whenToUseGenFeed:
      'You want the draft, the media, a human review, and publishing in one workspace',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Video Generation', genfeed: true },
      { competitor: true, feature: 'AI Image Generation', genfeed: true },
      {
        competitor: 'Speak and characters',
        feature: 'AI Voice & Avatars',
        genfeed: true,
      },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      {
        competitor: 'Paid plans',
        feature: 'Team Collaboration',
        genfeed: true,
      },
      { competitor: 'API', feature: 'Automation Workflows', genfeed: true },
      {
        competitor: 'Free tier + credit plans',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Video and image generation plus voice, articles, and publishing',
      'A review step before a post goes live',
      'Scheduling to connected channels',
      'Workflows that repeat a campaign, not a single clip',
    ],
    name: 'Higgsfield',
    pricing: 'Free tier, then credit plans',
    slug: 'higgsfield',
    strengths: [
      'Image and video generation across many models',
      'Social and ad creative, including a UGC builder',
      'Public API for generation jobs',
    ],
    tagline: 'AI image and video studio for social clips and ads',
    targetAudience: 'Creators and advertisers producing short AI video',
    weaknesses: [
      'A generation studio, not a publishing calendar',
      'No long-form article workflow',
      'No review queue tied to connected social accounts',
      'Output stops when credits run out',
    ],
    whenToUseCompetitor:
      'You want a credit studio for cinematic clips, images, and ad variants',
    whenToUseGenFeed:
      'You want those assets produced, reviewed, and published from the same workspace',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI Avatar Videos', genfeed: true },
      { competitor: true, feature: 'AI Video Generation', genfeed: true },
      {
        competitor: 'Product stills',
        feature: 'AI Image Generation',
        genfeed: true,
      },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      {
        competitor: 'Scale plan',
        feature: 'Team Collaboration',
        genfeed: true,
      },
      { competitor: 'API', feature: 'Automation Workflows', genfeed: true },
      {
        competitor: '$468-5988',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Avatar video plus image, voice, and articles',
      'Publishing to connected channels after review',
      'Campaign workflows, not only presenter clips',
      'Pay-per-output credits instead of a large monthly credit bundle',
    ],
    name: 'Argil',
    pricing: '$39-499/month',
    slug: 'argil',
    strengths: [
      'Presenter videos from a photo and a short voice sample',
      'Stock avatars plus custom avatar styles',
      'Product and story clips, with an API on paid plans',
    ],
    tagline: 'AI presenter and product videos from credits',
    targetAudience: 'Creators and brands who want a cloned presenter on camera',
    weaknesses: [
      'Built around avatar and product video',
      'No social scheduling or channel analytics',
      'No article studio',
      'Credits refresh monthly and do not stack',
    ],
    whenToUseCompetitor:
      'You need a cloned presenter or product video and will publish it yourself',
    whenToUseGenFeed:
      'You need the presenter clip plus the other formats, a review, and publishing',
  },
  {
    comparisonTable: [
      { competitor: true, feature: 'AI UGC Ad Videos', genfeed: true },
      { competitor: true, feature: 'AI Video Generation', genfeed: true },
      { competitor: false, feature: 'Article Writing', genfeed: true },
      { competitor: false, feature: 'AI Image Generation', genfeed: true },
      {
        competitor: false,
        feature: 'Multi-Platform Publishing',
        genfeed: true,
      },
      { competitor: false, feature: 'ROI Tracking', genfeed: true },
      {
        competitor: 'Higher plans',
        feature: 'Team Collaboration',
        genfeed: true,
      },
      {
        competitor: 'Higher plans',
        feature: 'Automation Workflows',
        genfeed: true,
      },
      {
        competitor: 'In-app credit plans',
        feature: 'Entry price',
        genfeed: 'Free + pay-per-output credits',
      },
    ],
    genfeedAdvantages: [
      'Ad variants plus image, voice, articles, and other video',
      'Review before a creative is scheduled',
      'Publishing to connected channels from the same workspace',
      'A public price: free to join, then pay for output',
    ],
    name: 'Arcads',
    pricing: 'In-app credit plans',
    slug: 'arcads',
    strengths: [
      'AI actors for paid-social UGC ads',
      'Script-to-video with talking actors',
      'Access to several video models inside one ad workflow',
    ],
    tagline: 'AI actors for UGC ad creatives',
    targetAudience: 'Performance marketers producing actor-led ads',
    weaknesses: [
      'An ad-creative tool, not a content operating system',
      'No publishing calendar',
      'No article, image, or voice studio beside the ad',
      'Plan prices are shown after sign-in, not on a public pricing page',
    ],
    whenToUseCompetitor:
      'You need a batch of actor-led ad videos and already have somewhere to run them',
    whenToUseGenFeed:
      'You need the ad creative, the other content formats, and a reviewed publish step',
  },
];

export function getCompetitorBySlug(slug: string): Competitor | undefined {
  return competitors.find((c) => c.slug === slug);
}

export function getAllCompetitorSlugs(): string[] {
  return competitors.map((c) => c.slug);
}
