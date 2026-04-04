export interface Integration {
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  keywords: string[];
  features: string[];
  workflow: { step: number; title: string; description: string }[];
  cta: string;
}

export const integrations: Integration[] = [
  {
    cta: 'Start Creating for YouTube',
    description:
      'Generate scroll-stopping YouTube videos, Shorts, and thumbnails with AI. Optimize titles, descriptions, and tags for maximum reach and subscriber growth.',
    features: [
      'AI-generated YouTube Shorts and long-form video clips ready to upload',
      'Thumbnail generation with click-optimized compositions and text overlays',
      'SEO-optimized titles, descriptions, and tags generated from trending topics',
      'Automatic caption and subtitle generation for accessibility and engagement',
      'YouTube Analytics integration to track views, watch time, and subscriber growth',
    ],
    icon: 'FaYoutube',
    keywords: [
      'ai video generator for youtube',
      'youtube shorts maker ai',
      'youtube thumbnail generator ai',
      'ai youtube content creator',
      'youtube automation tool',
      'youtube seo optimization ai',
    ],
    name: 'YouTube',
    slug: 'youtube',
    tagline: 'AI-powered YouTube content creation and optimization',
    workflow: [
      {
        description:
          'Discover trending topics and keywords in your niche using AI-powered trend analysis',
        step: 1,
        title: 'Research Trends',
      },
      {
        description:
          'Generate Shorts, video clips, and thumbnails with AI models like Veo 3 and Sora 2',
        step: 2,
        title: 'Generate Videos & Thumbnails',
      },
      {
        description:
          'AI writes SEO-optimized titles, descriptions, tags, and captions for your uploads',
        step: 3,
        title: 'Optimize Metadata',
      },
      {
        description:
          'Schedule and publish directly to your YouTube channel from Genfeed',
        step: 4,
        title: 'Publish to YouTube',
      },
      {
        description:
          'Track views, watch time, CTR, and subscriber growth to double down on what works',
        step: 5,
        title: 'Analyze & Iterate',
      },
    ],
  },
  {
    cta: 'Grow on TikTok with AI',
    description:
      'Create viral TikTok content at scale with AI video generation, trending sound integration, and algorithm-optimized posting. Go from idea to viral clip in minutes.',
    features: [
      'Vertical video generation optimized for TikTok aspect ratios and durations',
      'Trending hashtag and sound recommendations based on real-time TikTok data',
      'Auto-generated captions and text overlays in TikTok-native styles',
      'Batch creation of 30+ TikToks in a single session for daily posting',
      'Best-time-to-post scheduling powered by audience activity analysis',
      'Performance tracking to identify which hooks and formats drive the most views',
    ],
    icon: 'FaTiktok',
    keywords: [
      'tiktok content creator tool',
      'ai tiktok video maker',
      'tiktok automation tool ai',
      'tiktok video generator',
      'ai content creator for tiktok',
      'tiktok growth tool',
    ],
    name: 'TikTok',
    slug: 'tiktok',
    tagline: 'Create viral TikTok content with AI at scale',
    workflow: [
      {
        description:
          'AI identifies trending sounds, hashtags, and content formats on TikTok right now',
        step: 1,
        title: 'Spot TikTok Trends',
      },
      {
        description:
          'Generate vertical videos with AI, complete with hooks, transitions, and text overlays',
        step: 2,
        title: 'Create Vertical Videos',
      },
      {
        description:
          'Produce 30 days of TikTok content in one batch session to stay consistent',
        step: 3,
        title: 'Batch Create Content',
      },
      {
        description:
          'Schedule posts at optimal times when your audience is most active',
        step: 4,
        title: 'Schedule & Publish',
      },
      {
        description:
          'Track views, shares, and follower growth to refine your content strategy',
        step: 5,
        title: 'Track & Optimize',
      },
    ],
  },
  {
    cta: 'Create Instagram Content with AI',
    description:
      'Generate stunning Reels, Stories, carousels, and feed posts with AI. Maintain a cohesive aesthetic while posting consistently across all Instagram formats.',
    features: [
      'AI Reels generation with trending audio suggestions and caption overlays',
      'Feed post and carousel image generation with brand-consistent aesthetics',
      'Story templates with interactive elements like polls and question stickers',
      'Hashtag strategy recommendations based on niche analysis and reach potential',
      'Visual content calendar to plan and preview your Instagram grid layout',
    ],
    icon: 'FaInstagram',
    keywords: [
      'ai instagram content creator',
      'instagram reels maker ai',
      'ai instagram post generator',
      'instagram carousel generator ai',
      'instagram growth tool ai',
      'ai content for instagram',
    ],
    name: 'Instagram',
    slug: 'instagram',
    tagline: 'AI-generated Reels, Stories, and feed posts for Instagram',
    workflow: [
      {
        description:
          'Plan your content mix across Reels, Stories, carousels, and feed posts',
        step: 1,
        title: 'Plan Content Mix',
      },
      {
        description:
          'AI generates visuals and videos that match your brand aesthetic and color palette',
        step: 2,
        title: 'Generate Visual Content',
      },
      {
        description:
          'Get AI-written captions with optimized hashtags and calls-to-action',
        step: 3,
        title: 'Write Captions & Hashtags',
      },
      {
        description:
          'Preview how your grid will look and schedule posts for optimal engagement times',
        step: 4,
        title: 'Schedule & Preview Grid',
      },
      {
        description:
          'Monitor reach, engagement rate, and follower growth across all post formats',
        step: 5,
        title: 'Measure Performance',
      },
    ],
  },
  {
    cta: 'Dominate LinkedIn with AI Content',
    description:
      'Generate thought leadership posts, articles, carousels, and video content tailored for LinkedIn. Build authority in your industry and drive B2B leads with AI-powered content.',
    features: [
      'AI-generated thought leadership posts with hook-driven formats that drive engagement',
      'Professional article and newsletter creation optimized for LinkedIn algorithm',
      'Carousel document generation with data-driven insights and takeaways',
      'Video content formatted for LinkedIn feed with professional captions',
      'Engagement analytics tracking impressions, reactions, comments, and profile visits',
      'Optimal posting schedule based on your professional network activity patterns',
    ],
    icon: 'FaLinkedin',
    keywords: [
      'linkedin post generator ai',
      'ai linkedin content creator',
      'linkedin thought leadership ai',
      'linkedin carousel maker ai',
      'linkedin article writer ai',
      'b2b content generator linkedin',
    ],
    name: 'LinkedIn',
    slug: 'linkedin',
    tagline: 'AI-powered thought leadership and B2B content for LinkedIn',
    workflow: [
      {
        description:
          'AI identifies trending professional topics and conversations in your industry',
        step: 1,
        title: 'Identify Industry Topics',
      },
      {
        description:
          'Generate posts, articles, carousels, and video content tailored for professional audiences',
        step: 2,
        title: 'Create Professional Content',
      },
      {
        description:
          'AI optimizes hooks, formatting, and CTAs for maximum LinkedIn algorithm reach',
        step: 3,
        title: 'Optimize for the Algorithm',
      },
      {
        description:
          'Schedule posts when your professional network is most active on the platform',
        step: 4,
        title: 'Publish at Peak Times',
      },
      {
        description:
          'Track impressions, engagement, and inbound leads generated from your content',
        step: 5,
        title: 'Track Leads & Engagement',
      },
    ],
  },
  {
    cta: 'Scale Your Facebook Content with AI',
    description:
      'Create engaging Facebook posts, Reels, group content, and ad creatives with AI. Reach your audience across Facebook feeds, groups, and Stories with consistent, platform-optimized content.',
    features: [
      'AI-generated feed posts, Reels, and Stories optimized for Facebook engagement',
      'Group content creation with discussion-starting formats and questions',
      'Ad creative generation for Facebook Ads with multiple variations for A/B testing',
      'Audience-targeted content suggestions based on page insights and demographics',
      'Cross-posting to Facebook Pages, Groups, and personal profiles from one dashboard',
    ],
    icon: 'FaFacebook',
    keywords: [
      'ai facebook content creator',
      'facebook post generator ai',
      'facebook reels maker ai',
      'ai facebook ad creator',
      'facebook group content generator',
      'facebook marketing ai tool',
    ],
    name: 'Facebook',
    slug: 'facebook',
    tagline: 'AI content creation for Facebook Pages, Groups, and Ads',
    workflow: [
      {
        description:
          'AI analyzes your audience demographics and interests to recommend content themes',
        step: 1,
        title: 'Understand Your Audience',
      },
      {
        description:
          'Generate posts, Reels, and Stories tailored for Facebook feed algorithms',
        step: 2,
        title: 'Generate Multi-Format Content',
      },
      {
        description:
          'Create multiple ad variations with different hooks, visuals, and CTAs for testing',
        step: 3,
        title: 'Create Ad Variations',
      },
      {
        description:
          'Publish to Pages, Groups, and profiles simultaneously with platform-specific formatting',
        step: 4,
        title: 'Distribute Across Facebook',
      },
      {
        description:
          'Monitor reach, engagement, and ad performance to optimize your content strategy',
        step: 5,
        title: 'Optimize with Insights',
      },
    ],
  },
  {
    cta: 'Build Your X Presence with AI',
    description:
      'Generate high-engagement tweets, threads, and video content for X (Twitter). Grow your audience with AI-crafted hooks, timely takes, and consistent posting across text and media formats.',
    features: [
      'AI-generated tweets with attention-grabbing hooks and engagement-optimized formatting',
      'Thread creation from long-form content with automatic numbering and flow',
      'Video clip generation sized and formatted for X timeline autoplay',
      'Real-time trending topic integration to draft timely, relevant takes',
      'Engagement tracking across impressions, retweets, replies, and profile clicks',
      'Automated reply and quote-tweet drafts for community engagement',
    ],
    icon: 'FaXTwitter',
    keywords: [
      'ai twitter content creator',
      'x twitter post generator ai',
      'ai tweet generator',
      'twitter thread maker ai',
      'x growth tool ai',
      'twitter automation ai tool',
    ],
    name: 'X (Twitter)',
    slug: 'x-twitter',
    tagline: 'AI-powered tweets, threads, and video for X',
    workflow: [
      {
        description:
          'AI monitors trending topics and conversations relevant to your niche in real time',
        step: 1,
        title: 'Monitor Trending Topics',
      },
      {
        description:
          'Generate tweets, threads, and video clips with hooks that stop the scroll',
        step: 2,
        title: 'Draft Content',
      },
      {
        description:
          'AI optimizes tweet length, formatting, and timing for maximum impressions',
        step: 3,
        title: 'Optimize for Reach',
      },
      {
        description:
          'Schedule tweets and threads at optimal posting times throughout the day',
        step: 4,
        title: 'Schedule Posts',
      },
      {
        description:
          'Track impressions, engagement rate, and follower growth to refine your strategy',
        step: 5,
        title: 'Analyze & Grow',
      },
    ],
  },
  {
    cta: 'Drive Traffic from Pinterest with AI',
    description:
      'Generate eye-catching Pins, Idea Pins, and board content with AI. Drive sustained organic traffic to your website with search-optimized visual content that ranks on Pinterest.',
    features: [
      'AI-generated Pin images with text overlays optimized for Pinterest click-through rates',
      'Idea Pin creation with multi-slide storytelling and step-by-step formats',
      'Pinterest SEO optimization with keyword-rich titles, descriptions, and alt text',
      'Board strategy recommendations based on niche trends and search volume',
    ],
    icon: 'FaPinterest',
    keywords: [
      'ai pinterest pin generator',
      'pinterest content creator ai',
      'pinterest marketing tool ai',
      'ai pin maker for pinterest',
      'pinterest seo tool ai',
      'pinterest automation ai',
    ],
    name: 'Pinterest',
    slug: 'pinterest',
    tagline: 'AI-generated Pins and Idea Pins that drive organic traffic',
    workflow: [
      {
        description:
          'AI analyzes Pinterest search trends to find high-volume, low-competition keywords',
        step: 1,
        title: 'Research Pinterest Keywords',
      },
      {
        description:
          'Generate tall, eye-catching Pin images with compelling text overlays and branding',
        step: 2,
        title: 'Create Pin Designs',
      },
      {
        description:
          'AI writes keyword-rich titles, descriptions, and board names for Pinterest search ranking',
        step: 3,
        title: 'Optimize for Pinterest SEO',
      },
      {
        description:
          'Schedule Pins across boards at intervals optimized for Pinterest distribution algorithm',
        step: 4,
        title: 'Schedule & Distribute',
      },
      {
        description:
          'Track impressions, saves, clicks, and outbound traffic to measure ROI',
        step: 5,
        title: 'Track Traffic & Saves',
      },
    ],
  },
  {
    cta: 'Grow on Reddit with AI Content',
    description:
      'Create authentic, community-first content for Reddit. Generate discussion posts, insightful comments, and visual content tailored to subreddit cultures and rules.',
    features: [
      'Subreddit-aware content generation that matches community tone and posting rules',
      'Discussion post creation with engaging titles and thoughtful, detailed body text',
      'Visual content generation for image-heavy subreddits with proper formatting',
      'Best posting time recommendations based on subreddit activity patterns',
      'Karma and engagement tracking across multiple subreddit communities',
    ],
    icon: 'FaReddit',
    keywords: [
      'ai reddit content creator',
      'reddit post generator ai',
      'reddit marketing tool ai',
      'ai reddit growth tool',
      'reddit content strategy ai',
      'reddit automation tool',
    ],
    name: 'Reddit',
    slug: 'reddit',
    tagline: 'AI-crafted content that resonates with Reddit communities',
    workflow: [
      {
        description:
          'AI identifies relevant subreddits and analyzes what content performs best in each community',
        step: 1,
        title: 'Find Target Subreddits',
      },
      {
        description:
          'Generate discussion posts, images, and comments that match each subreddit tone and rules',
        step: 2,
        title: 'Create Community Content',
      },
      {
        description:
          'AI ensures content follows subreddit rules and uses authentic, non-promotional language',
        step: 3,
        title: 'Review for Authenticity',
      },
      {
        description:
          'Post at peak activity times for each subreddit to maximize visibility and upvotes',
        step: 4,
        title: 'Post at Peak Times',
      },
      {
        description:
          'Track upvotes, comments, and referral traffic from Reddit to your site',
        step: 5,
        title: 'Monitor Engagement',
      },
    ],
  },
  {
    cta: 'Power Your Discord Community with AI',
    description:
      'Generate engaging content for Discord communities. Create announcements, event promotions, and visual content that keeps your server active and growing.',
    features: [
      'Server announcement generation with formatted embeds and engaging copy',
      'Event promotion content with countdown visuals and RSVP-driving calls to action',
      'Community engagement content like polls, discussion prompts, and themed challenges',
      'Visual content creation sized for Discord embeds and channel banners',
    ],
    icon: 'FaDiscord',
    keywords: [
      'ai discord content creator',
      'discord server growth tool ai',
      'discord announcement generator ai',
      'ai content for discord',
      'discord community management ai',
      'discord marketing tool',
    ],
    name: 'Discord',
    slug: 'discord',
    tagline: 'AI-powered content for thriving Discord communities',
    workflow: [
      {
        description:
          'AI helps plan content themes, events, and engagement activities for your server',
        step: 1,
        title: 'Plan Community Content',
      },
      {
        description:
          'Generate announcements, discussion prompts, and event promotions with rich formatting',
        step: 2,
        title: 'Create Announcements & Prompts',
      },
      {
        description:
          'AI generates images, banners, and visual content sized perfectly for Discord embeds',
        step: 3,
        title: 'Design Server Visuals',
      },
      {
        description:
          'Schedule and publish content to your Discord channels at optimal engagement times',
        step: 4,
        title: 'Publish to Channels',
      },
    ],
  },
  {
    cta: 'Level Up Your Twitch Content with AI',
    description:
      'Create professional Twitch content with AI. Generate stream overlays, clip highlights, social media promotions, and channel art that helps you stand out and grow your viewer base.',
    features: [
      'Stream highlight clip generation from VODs with AI-detected best moments',
      'Channel art and overlay generation including panels, banners, and emote concepts',
      'Pre-stream and post-stream social media content to drive viewers to your channel',
      'Clip-to-short conversion for repurposing Twitch highlights to TikTok and YouTube Shorts',
      'Viewer engagement analytics tracking concurrent viewers, followers, and subscriber growth',
    ],
    icon: 'FaTwitch',
    keywords: [
      'ai twitch content creator',
      'twitch clip maker ai',
      'twitch overlay generator ai',
      'ai streamer tools twitch',
      'twitch growth tool ai',
      'twitch highlight generator ai',
    ],
    name: 'Twitch',
    slug: 'twitch',
    tagline: 'AI content tools for streamers and Twitch creators',
    workflow: [
      {
        description:
          'AI analyzes your VODs to automatically detect and extract the most engaging moments',
        step: 1,
        title: 'Extract Stream Highlights',
      },
      {
        description:
          'Convert highlights into vertical clips ready for TikTok, YouTube Shorts, and Instagram Reels',
        step: 2,
        title: 'Create Short-Form Clips',
      },
      {
        description:
          'Generate channel panels, banners, offline screens, and emote concepts with AI',
        step: 3,
        title: 'Design Channel Assets',
      },
      {
        description:
          'Auto-generate social media posts promoting your upcoming and recent streams',
        step: 4,
        title: 'Promote Streams on Social',
      },
      {
        description:
          'Track viewer counts, follower growth, and clip performance across platforms',
        step: 5,
        title: 'Track Growth Metrics',
      },
    ],
  },
  {
    cta: 'Publish to WordPress with AI',
    description:
      'Generate and publish blog posts, articles, and pages directly to your WordPress site. AI handles writing, formatting, and SEO optimization so you can focus on growing your audience.',
    features: [
      'AI-generated blog posts with proper HTML formatting, headings, and structure',
      'SEO-optimized meta titles, descriptions, and slugs for organic search ranking',
      'Featured image generation with AI to complement your written content',
      'Category and tag suggestions based on content analysis and site taxonomy',
      'Direct publishing to WordPress.com via OAuth with scheduling support',
    ],
    icon: 'FaWordpress',
    keywords: [
      'ai wordpress blog writer',
      'wordpress content generator ai',
      'ai blog post generator wordpress',
      'wordpress seo optimization ai',
      'wordpress publishing automation',
      'ai content for wordpress',
    ],
    name: 'WordPress',
    slug: 'wordpress',
    tagline: 'AI-powered blog content creation and publishing for WordPress',
    workflow: [
      {
        description:
          'AI researches trending topics and keywords in your niche for blog content ideas',
        step: 1,
        title: 'Research Blog Topics',
      },
      {
        description:
          'Generate full blog posts with proper formatting, headings, and engaging copy',
        step: 2,
        title: 'Generate Blog Content',
      },
      {
        description:
          'AI optimizes meta titles, descriptions, slugs, and internal linking for SEO',
        step: 3,
        title: 'Optimize for SEO',
      },
      {
        description:
          'Publish directly to your WordPress site or schedule posts for optimal timing',
        step: 4,
        title: 'Publish to WordPress',
      },
    ],
  },
  {
    cta: 'Create Snapchat Content with AI',
    description:
      'Generate Snapchat-ready vertical content, Snap Ads, and Story sequences with AI. Reach younger demographics with platform-native formats optimized for engagement.',
    features: [
      'Vertical image and video generation sized for Snapchat Stories and Spotlight',
      'Snap Ad creative generation with swipe-up call-to-action overlays',
      'Story sequence creation with multi-slide narratives and AR-style filters',
      'Audience targeting recommendations based on Snapchat demographics',
    ],
    icon: 'FaSnapchat',
    keywords: [
      'ai snapchat content creator',
      'snapchat ad maker ai',
      'snapchat story generator ai',
      'ai content for snapchat',
      'snapchat marketing tool ai',
      'snapchat automation tool',
    ],
    name: 'Snapchat',
    slug: 'snapchat',
    tagline: 'AI-generated Stories and Snap Ads for younger audiences',
    workflow: [
      {
        description:
          'Identify trending lenses, sounds, and content styles on Snapchat',
        step: 1,
        title: 'Spot Snapchat Trends',
      },
      {
        description:
          'Generate vertical-first images and videos optimized for Snapchat formats',
        step: 2,
        title: 'Create Snap Content',
      },
      {
        description:
          'Build multi-slide Story sequences with engaging narratives and CTAs',
        step: 3,
        title: 'Build Story Sequences',
      },
      {
        description:
          'Publish Stories and Spotlight content directly from Genfeed',
        step: 4,
        title: 'Publish to Snapchat',
      },
    ],
  },
  {
    cta: 'Engage Customers on WhatsApp',
    description:
      'Send AI-generated marketing messages, product updates, and promotional content through WhatsApp Business. Reach customers directly with personalized messaging at scale.',
    features: [
      'AI-generated marketing messages optimized for WhatsApp conversational format',
      'Template message creation for promotions, updates, and transactional notifications',
      'Media message support with AI-generated images and product visuals',
      'Message status tracking for delivery, read receipts, and engagement rates',
      'Twilio-powered reliable delivery with enterprise-grade infrastructure',
    ],
    icon: 'FaWhatsapp',
    keywords: [
      'whatsapp business marketing ai',
      'ai whatsapp message generator',
      'whatsapp business automation',
      'whatsapp marketing tool ai',
      'ai content for whatsapp',
      'whatsapp business api integration',
    ],
    name: 'WhatsApp',
    slug: 'whatsapp',
    tagline: 'AI-powered WhatsApp Business messaging and marketing',
    workflow: [
      {
        description:
          'Define your audience segments and message templates for different campaigns',
        step: 1,
        title: 'Set Up Campaigns',
      },
      {
        description:
          'AI generates personalized message content with media attachments',
        step: 2,
        title: 'Generate Messages',
      },
      {
        description:
          'Send messages through WhatsApp Business API via Twilio integration',
        step: 3,
        title: 'Send via WhatsApp',
      },
      {
        description:
          'Track delivery rates, read receipts, and customer engagement metrics',
        step: 4,
        title: 'Track Engagement',
      },
    ],
  },
  {
    cta: 'Join the Fediverse with AI Content',
    description:
      'Generate and publish content to Mastodon and the Fediverse. Create engaging toots, threads, and media posts for decentralized social networks with AI assistance.',
    features: [
      'AI-generated toots optimized for Mastodon character limits and formatting',
      'Thread creation with automatic chaining for long-form Mastodon content',
      'Instance-aware posting with support for any Mastodon-compatible server',
      'Media attachment generation with AI images and alt-text descriptions',
      'Hashtag strategy for Fediverse discovery and cross-instance reach',
    ],
    icon: 'FaMastodon',
    keywords: [
      'mastodon content creator ai',
      'fediverse social media tool',
      'ai mastodon post generator',
      'mastodon automation tool',
      'decentralized social media ai',
      'mastodon marketing tool',
    ],
    name: 'Mastodon',
    slug: 'mastodon',
    tagline: 'AI content creation for Mastodon and the Fediverse',
    workflow: [
      {
        description:
          'Connect your Mastodon account from any instance with OAuth authentication',
        step: 1,
        title: 'Connect Your Instance',
      },
      {
        description:
          'AI generates toots, threads, and media content tailored for Fediverse culture',
        step: 2,
        title: 'Create Fediverse Content',
      },
      {
        description:
          'Optimize hashtags and formatting for cross-instance discovery',
        step: 3,
        title: 'Optimize for Discovery',
      },
      {
        description:
          'Publish toots and threads directly to your Mastodon account',
        step: 4,
        title: 'Publish to Mastodon',
      },
    ],
  },
  {
    cta: 'Publish to Ghost with AI',
    description:
      'Generate and publish professional blog posts and newsletters to your Ghost publication. AI handles content creation, formatting, and SEO while you maintain full editorial control.',
    features: [
      'AI-generated blog posts with Ghost-compatible Mobiledoc formatting',
      'Newsletter content creation with email-optimized layouts and CTAs',
      'SEO optimization with meta titles, descriptions, and structured data',
      'Featured image generation with AI for posts and newsletters',
      'Tag and author management for organized content taxonomy',
    ],
    icon: 'FaGhost',
    keywords: [
      'ghost cms ai writer',
      'ai blog generator ghost',
      'ghost newsletter ai',
      'ghost publishing automation',
      'ai content for ghost blog',
      'ghost cms content creator',
    ],
    name: 'Ghost',
    slug: 'ghost',
    tagline: 'AI-powered blogging and newsletters for Ghost CMS',
    workflow: [
      {
        description: 'Connect your Ghost publication using your Admin API key',
        step: 1,
        title: 'Connect Ghost Site',
      },
      {
        description:
          'AI generates full blog posts with proper formatting and featured images',
        step: 2,
        title: 'Generate Blog Content',
      },
      {
        description:
          'Optimize content for SEO with meta tags, descriptions, and structured data',
        step: 3,
        title: 'Optimize for SEO',
      },
      {
        description:
          'Publish posts and send newsletters directly from Genfeed to Ghost',
        step: 4,
        title: 'Publish to Ghost',
      },
    ],
  },
  {
    cta: 'Create Shopify Content with AI',
    description:
      'Generate product descriptions, blog posts, and marketing content for your Shopify store. AI creates SEO-optimized content that drives traffic and converts visitors into customers.',
    features: [
      'AI-generated product descriptions with SEO keywords and persuasive copy',
      'Blog article creation for Shopify stores to drive organic traffic',
      'Product image generation and enhancement with AI visual models',
      'Collection page content with thematic descriptions and category copy',
      'GraphQL API integration for seamless content publishing to Shopify',
    ],
    icon: 'FaShopify',
    keywords: [
      'shopify product description ai',
      'ai content for shopify store',
      'shopify blog writer ai',
      'shopify seo tool ai',
      'ai shopify marketing',
      'shopify content automation',
    ],
    name: 'Shopify',
    slug: 'shopify',
    tagline: 'AI content creation for Shopify e-commerce stores',
    workflow: [
      {
        description:
          'Connect your Shopify store via OAuth for seamless content publishing',
        step: 1,
        title: 'Connect Shopify Store',
      },
      {
        description:
          'AI generates product descriptions, blog posts, and collection content',
        step: 2,
        title: 'Generate Store Content',
      },
      {
        description:
          'Optimize all content for search engines with keywords and meta data',
        step: 3,
        title: 'Optimize for SEO',
      },
      {
        description:
          'Publish content directly to your Shopify store via GraphQL API',
        step: 4,
        title: 'Publish to Shopify',
      },
    ],
  },
  {
    cta: 'Launch Your Newsletter with AI',
    description:
      'Create and publish AI-generated newsletters through Beehiiv. Generate engaging newsletter content, manage subscribers, and grow your audience with data-driven content strategies.',
    features: [
      'AI-generated newsletter content with engaging subject lines and body copy',
      'Subscriber management with segmentation and growth tracking',
      'A/B test subject line generation for optimizing open rates',
      'Publication scheduling with audience timezone optimization',
      'Analytics integration for tracking opens, clicks, and subscriber growth',
    ],
    icon: 'HiNewspaper',
    keywords: [
      'beehiiv newsletter ai',
      'ai newsletter generator',
      'beehiiv content creator ai',
      'newsletter automation tool',
      'ai email newsletter writer',
      'beehiiv publishing tool',
    ],
    name: 'Beehiiv',
    slug: 'beehiiv',
    tagline: 'AI-powered newsletter creation and publishing for Beehiiv',
    workflow: [
      {
        description:
          'Connect your Beehiiv publication with your API key for direct publishing',
        step: 1,
        title: 'Connect Beehiiv',
      },
      {
        description:
          'AI generates newsletter editions with compelling subject lines and content',
        step: 2,
        title: 'Generate Newsletter Content',
      },
      {
        description:
          'Review, edit, and schedule your newsletter for optimal send times',
        step: 3,
        title: 'Schedule & Send',
      },
      {
        description:
          'Track open rates, click rates, and subscriber growth across editions',
        step: 4,
        title: 'Analyze Performance',
      },
    ],
  },
  {
    cta: 'Publish on Medium with AI',
    description:
      'Generate and publish thought leadership articles, essays, and stories on Medium. AI creates well-structured, engaging long-form content optimized for Medium distribution and curation.',
    features: [
      'AI-generated articles with proper Medium formatting and structure',
      'Publication submission with tag optimization for Medium curation',
      'Story series creation for serialized content and recurring themes',
      'Reading time optimization to match Medium audience preferences',
      'Cross-posting from your blog with platform-specific reformatting',
    ],
    icon: 'FaMedium',
    keywords: [
      'medium article generator ai',
      'ai writer for medium',
      'medium blog automation',
      'ai content for medium',
      'medium publishing tool ai',
      'medium seo optimization',
    ],
    name: 'Medium',
    slug: 'medium',
    tagline: 'AI-generated articles and stories for Medium publications',
    workflow: [
      {
        description:
          'AI identifies trending topics and high-engagement formats on Medium',
        step: 1,
        title: 'Research Medium Topics',
      },
      {
        description:
          'Generate well-structured articles with engaging intros and clear takeaways',
        step: 2,
        title: 'Write Articles',
      },
      {
        description:
          'Optimize tags, titles, and subtitles for Medium distribution algorithm',
        step: 3,
        title: 'Optimize for Distribution',
      },
      {
        description:
          'Publish stories directly to your Medium profile or publications',
        step: 4,
        title: 'Publish to Medium',
      },
    ],
  },
  {
    cta: 'Create for Threads with AI',
    description:
      'Generate engaging text posts and threads for Meta Threads. Build your presence on the text-first platform with AI-crafted content optimized for conversation and engagement.',
    features: [
      'AI-generated text posts optimized for Threads character limits and style',
      'Thread creation with multi-post narratives for longer stories',
      'Image carousel generation for visual Threads content',
      'Cross-platform content adaptation from Instagram and Twitter',
      'Engagement-optimized posting with conversation-starting hooks',
    ],
    icon: 'FaThreads',
    keywords: [
      'threads content creator ai',
      'ai threads post generator',
      'meta threads automation',
      'threads marketing tool ai',
      'ai content for threads',
      'threads growth tool',
    ],
    name: 'Threads',
    slug: 'threads',
    tagline: 'AI-powered text content for Meta Threads',
    workflow: [
      {
        description: 'AI analyzes trending conversations and topics on Threads',
        step: 1,
        title: 'Find Trending Topics',
      },
      {
        description:
          'Generate engaging text posts and multi-part threads with strong hooks',
        step: 2,
        title: 'Create Thread Content',
      },
      {
        description:
          'Schedule posts for when your Threads audience is most active',
        step: 3,
        title: 'Schedule Posts',
      },
      {
        description: 'Track replies, reposts, and follower growth on Threads',
        step: 4,
        title: 'Track Engagement',
      },
    ],
  },
  {
    cta: 'Supercharge Your Telegram Channel',
    description:
      'Create and publish AI-generated content for Telegram channels and groups. Generate engaging posts, announcements, and media content that keeps your Telegram community active.',
    features: [
      'AI-generated channel posts with rich formatting and media attachments',
      'Announcement creation with engaging copy and call-to-action buttons',
      'Group discussion prompts and community engagement content',
      'Media content generation with images and videos sized for Telegram',
      'Scheduled posting for consistent channel content delivery',
    ],
    icon: 'FaTelegram',
    keywords: [
      'telegram channel content ai',
      'ai telegram bot content',
      'telegram marketing tool ai',
      'telegram automation ai',
      'ai content for telegram',
      'telegram channel growth tool',
    ],
    name: 'Telegram',
    slug: 'telegram',
    tagline: 'AI content creation for Telegram channels and communities',
    workflow: [
      {
        description:
          'Connect your Telegram bot for automated content delivery to channels',
        step: 1,
        title: 'Connect Telegram Bot',
      },
      {
        description:
          'AI generates channel posts, announcements, and media content',
        step: 2,
        title: 'Generate Channel Content',
      },
      {
        description:
          'Schedule posts for optimal engagement times in your channel timezone',
        step: 3,
        title: 'Schedule Delivery',
      },
      {
        description:
          'Track message views, forwards, and channel subscriber growth',
        step: 4,
        title: 'Monitor Channel Growth',
      },
    ],
  },
  {
    cta: 'Engage Your Slack Workspace',
    description:
      'Create and distribute AI-generated content across Slack workspaces. Generate announcements, updates, and engagement content for internal communications and community Slack channels.',
    features: [
      'AI-generated workspace announcements with rich Slack Block Kit formatting',
      'Scheduled content delivery to multiple channels simultaneously',
      'Community engagement content with polls, questions, and discussion starters',
      'Media attachment support with AI-generated images and documents',
    ],
    icon: 'FaSlack',
    keywords: [
      'slack content automation ai',
      'ai slack announcements',
      'slack workspace content tool',
      'slack community management ai',
      'ai content for slack',
      'slack marketing automation',
    ],
    name: 'Slack',
    slug: 'slack',
    tagline: 'AI-powered content for Slack workspaces and communities',
    workflow: [
      {
        description:
          'Connect your Slack workspace with OAuth for channel access',
        step: 1,
        title: 'Connect Slack Workspace',
      },
      {
        description:
          'AI generates announcements, updates, and engagement content for your channels',
        step: 2,
        title: 'Create Channel Content',
      },
      {
        description:
          'Distribute content across multiple Slack channels on schedule',
        step: 3,
        title: 'Distribute to Channels',
      },
      {
        description:
          'Track message reactions, thread replies, and engagement across channels',
        step: 4,
        title: 'Track Engagement',
      },
    ],
  },
  {
    cta: 'Create for Fanvue with AI',
    description:
      'Generate premium content for your Fanvue creator profile. AI creates exclusive images, captions, and content strategies tailored for subscription-based monetization.',
    features: [
      'AI-generated premium images and visual content for subscriber feeds',
      'Caption and description generation optimized for subscriber engagement',
      'Content scheduling with drip-feed strategies for subscriber retention',
      'Pricing strategy recommendations based on content type and audience',
    ],
    icon: 'FaStar',
    keywords: [
      'fanvue content creator ai',
      'ai content for fanvue',
      'fanvue automation tool',
      'subscription content generator ai',
      'fanvue marketing ai',
      'creator content ai tool',
    ],
    name: 'Fanvue',
    slug: 'fanvue',
    tagline: 'AI-powered premium content creation for Fanvue creators',
    workflow: [
      {
        description:
          'Connect your Fanvue creator account for direct content publishing',
        step: 1,
        title: 'Connect Fanvue',
      },
      {
        description:
          'AI generates exclusive images and content for your subscriber feed',
        step: 2,
        title: 'Generate Premium Content',
      },
      {
        description:
          'Schedule content releases with drip-feed timing for subscriber retention',
        step: 3,
        title: 'Schedule Content Drip',
      },
      {
        description:
          'Track subscriber growth, engagement, and revenue from your content',
        step: 4,
        title: 'Track Revenue & Growth',
      },
    ],
  },
];

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find((i) => i.slug === slug);
}

export function getAllIntegrationSlugs(): string[] {
  return integrations.map((i) => i.slug);
}
