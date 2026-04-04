/**
 * Seed Script: Marketplace Listings
 *
 * Seeds sample marketplace listings and sellers for development/testing.
 * Uses upsert logic with field diffing - safe to run multiple times.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/marketplace.seed.ts
 *   bun run apps/server/api/scripts/seeds/marketplace.seed.ts --dry-run
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs, seedDocuments } from '@api-scripts/db/seed-utils';
import { Logger } from '@nestjs/common';
import { ObjectId } from 'mongodb';

const logger = new Logger('MarketplaceSeed');

// ============================================================================
// SELLERS
// ============================================================================

const SELLER_COLLECTION = 'sellers';

const SELLER_FIELDS_TO_CHECK = [
  'displayName',
  'bio',
  'avatar',
  'website',
  'social',
  'badgeTier',
  'status',
  'rating',
  'reviewCount',
  'followerCount',
  'totalSales',
  'totalEarnings',
  'isDeleted',
];

interface SellerDocument {
  slug: string;
  user: ObjectId;
  organization: ObjectId;
  displayName: string;
  bio?: string;
  avatar?: string;
  website?: string;
  social: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    youtube?: string;
  };
  badgeTier: string;
  status: string;
  rating: number;
  reviewCount: number;
  followerCount: number;
  totalSales: number;
  totalEarnings: number;
  stripeOnboardingComplete: boolean;
  payoutEnabled: boolean;
  isDeleted: boolean;
}

// Generate consistent ObjectIds for sellers (based on slug hash for reproducibility)
const sellerIds = {
  'automation-pro': new ObjectId(),
  'content-craft': new ObjectId(),
  'workflow-wizard': new ObjectId(),
};

// Placeholder user and org IDs (would be real IDs in production)
const placeholderUserId = new ObjectId();
const placeholderOrgId = new ObjectId();

const sellers: SellerDocument[] = [
  {
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=workflow-wizard',
    badgeTier: 'verified',
    bio: 'Automating the future of content creation. 5+ years building AI workflows for creators and businesses.',
    displayName: 'Workflow Wizard',
    followerCount: 892,
    isDeleted: false,
    organization: placeholderOrgId,
    payoutEnabled: true,
    rating: 4.8,
    reviewCount: 127,
    slug: 'workflow-wizard',
    social: {
      github: 'workflow-wizard',
      twitter: 'workflowwiz',
    },
    status: 'approved',
    stripeOnboardingComplete: true,
    totalEarnings: 2865400, // $28,654.00 in cents
    totalSales: 1543,
    user: placeholderUserId,
    website: 'https://workflowwizard.io',
  },
  {
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=content-craft',
    badgeTier: 'top_seller',
    bio: 'Professional content templates and workflows for social media managers and digital marketers.',
    displayName: 'Content Craft Studio',
    followerCount: 2341,
    isDeleted: false,
    organization: placeholderOrgId,
    payoutEnabled: true,
    rating: 4.9,
    reviewCount: 312,
    slug: 'content-craft',
    social: {
      twitter: 'contentcraft',
      youtube: 'contentcraftstudio',
    },
    status: 'approved',
    stripeOnboardingComplete: true,
    totalEarnings: 7894200, // $78,942.00 in cents
    totalSales: 4721,
    user: placeholderUserId,
    website: 'https://contentcraft.studio',
  },
  {
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=automation-pro',
    badgeTier: 'new',
    bio: 'Making complex workflows simple. Specializing in video and podcast automation.',
    displayName: 'AutomationPro',
    followerCount: 234,
    isDeleted: false,
    organization: placeholderOrgId,
    payoutEnabled: true,
    rating: 4.6,
    reviewCount: 45,
    slug: 'automation-pro',
    social: {
      github: 'automation-pro',
      linkedin: 'automationpro',
    },
    status: 'approved',
    stripeOnboardingComplete: true,
    totalEarnings: 456700, // $4,567.00 in cents
    totalSales: 312,
    user: placeholderUserId,
  },
];

// ============================================================================
// LISTINGS
// ============================================================================

const LISTING_COLLECTION = 'listings';

const LISTING_FIELDS_TO_CHECK = [
  'title',
  'shortDescription',
  'description',
  'price',
  'currency',
  'tags',
  'thumbnail',
  'previewImages',
  'views',
  'downloads',
  'purchases',
  'rating',
  'reviewCount',
  'likeCount',
  'version',
  'status',
  'isDeleted',
];

interface ListingDocument {
  slug: string;
  seller: ObjectId;
  organization: ObjectId;
  type: string;
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  currency: string;
  tags: string[];
  thumbnail?: string;
  previewImages: string[];
  previewData: Record<string, unknown>;
  downloadData: Record<string, unknown>;
  views: number;
  downloads: number;
  purchases: number;
  rating: number;
  reviewCount: number;
  likeCount: number;
  revenue: number;
  version: string;
  status: string;
  publishedAt: Date;
  canBeSoldSeparately: boolean;
  isDeleted: boolean;
}

const listings: ListingDocument[] = [
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# Social Media Content Pipeline

Transform your content creation process with this comprehensive AI-powered workflow.

## What's Included
- **Content Ideation Module** - Generate trending topic ideas based on your niche
- **Multi-Platform Formatter** - Automatically adapt content for Twitter, LinkedIn, Instagram, and Facebook
- **Scheduling Integration** - Direct export to Buffer, Hootsuite, or Later
- **Analytics Dashboard** - Track performance across all platforms

## How It Works
1. Input your brand voice and target audience
2. Select content themes or let AI suggest trending topics
3. Generate variations for each platform
4. Review, edit, and schedule in one click

## Perfect For
- Social media managers
- Marketing agencies
- Solo entrepreneurs
- Content creators

## Requirements
- Genfeed.ai account
- API credits for text generation

## Support
Email support included. Join our Discord community for tips and updates.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 156,
    organization: placeholderOrgId,
    previewData: { connections: 18, nodes: 12 },
    previewImages: [
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=1200&h=800&fit=crop',
    ],
    price: 1999, // $19.99
    publishedAt: new Date('2024-06-15'),
    purchases: 287,
    rating: 4.8,
    revenue: 573713, // $5,737.13
    reviewCount: 89,
    seller: sellerIds['workflow-wizard'],
    shortDescription:
      'End-to-end workflow for generating and scheduling social media content across platforms.',
    slug: 'social-media-content-pipeline',
    status: 'published',
    tags: ['automation', 'social', 'content', 'scheduling', 'multi-platform'],
    thumbnail:
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&h=400&fit=crop',
    title: 'Social Media Content Pipeline',
    type: 'workflow',
    version: '2.1.0',
    views: 3421,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# YouTube Thumbnail Generator

Create scroll-stopping thumbnails that boost your click-through rate.

## Features
- **Style Templates** - 15+ proven thumbnail styles (reaction, tutorial, vlog, etc.)
- **Face Enhancement** - Automatically enhance facial expressions
- **Text Overlay** - Smart text placement with attention-grabbing fonts
- **A/B Testing** - Generate multiple variants for testing
- **Batch Processing** - Create thumbnails for multiple videos at once

## Why This Workflow?
Thumbnails are responsible for 90% of a video's performance. This workflow uses proven design principles combined with AI to create thumbnails that convert.

## Includes
- 15 style presets
- Color palette generator
- Font pairing recommendations
- YouTube best practices guide

**Free to use** - Start creating stunning thumbnails today!`,
    downloadData: {},
    downloads: 2341,
    isDeleted: false,
    likeCount: 567,
    organization: placeholderOrgId,
    previewData: { connections: 8, nodes: 6 },
    previewImages: [
      'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&h=800&fit=crop',
    ],
    price: 0, // Free
    publishedAt: new Date('2024-03-20'),
    purchases: 2341,
    rating: 4.9,
    revenue: 0,
    reviewCount: 234,
    seller: sellerIds['content-craft'],
    shortDescription:
      'Create eye-catching YouTube thumbnails with AI-powered image generation.',
    slug: 'youtube-thumbnail-generator',
    status: 'published',
    tags: ['images', 'youtube', 'thumbnails', 'free', 'content'],
    thumbnail:
      'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&h=400&fit=crop',
    title: 'YouTube Thumbnail Generator',
    type: 'workflow',
    version: '1.3.0',
    views: 8932,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# Blog to Twitter Thread Converter

Repurpose your blog content into viral Twitter threads.

## How It Works
1. Paste your blog post URL or content
2. AI extracts key points and creates a narrative arc
3. Each tweet is optimized for engagement
4. Includes hook, body, and CTA tweets

## Features
- **Smart Chunking** - Breaks content into tweet-sized pieces
- **Thread Hooks** - Generates 3 hook options to choose from
- **Hashtag Suggestions** - Relevant hashtags for discoverability
- **Image Placeholders** - Suggests where to add visuals
- **Engagement Optimization** - Uses proven thread formulas

## Output Format
- Thread preview with character counts
- Direct post to Twitter/X via API
- Export as text file

Perfect for content marketers, bloggers, and thought leaders who want to maximize their content reach.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 89,
    organization: placeholderOrgId,
    previewData: { connections: 12, nodes: 8 },
    previewImages: [
      'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=1200&h=800&fit=crop',
    ],
    price: 999, // $9.99
    publishedAt: new Date('2024-07-01'),
    purchases: 178,
    rating: 4.7,
    revenue: 177822,
    reviewCount: 56,
    seller: sellerIds['workflow-wizard'],
    shortDescription:
      'Convert any blog post into an engaging Twitter thread with one click.',
    slug: 'blog-to-twitter-thread',
    status: 'published',
    tags: ['content', 'social', 'twitter', 'repurposing', 'automation'],
    thumbnail:
      'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&h=400&fit=crop',
    title: 'Blog to Twitter Thread',
    type: 'workflow',
    version: '1.5.0',
    views: 2156,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# AI Video Script Writer

Create compelling video scripts that keep viewers watching until the end.

## Script Types Supported
- **YouTube Long-form** - 10-30 minute educational/entertainment videos
- **YouTube Shorts** - Punchy 60-second scripts
- **TikTok** - Trend-aware, hook-focused scripts
- **Course Content** - Structured educational scripts
- **Product Demos** - Feature-benefit focused scripts

## Includes
- Opening hook templates (pattern interrupt, question, story)
- B-roll suggestions for each section
- Call-to-action library
- Retention markers (timestamps for key moments)

## Output
- Full script with speaker notes
- Shot list suggestions
- Estimated video duration
- Export to Google Docs, Notion, or plain text

## Advanced Features
- Competitor analysis integration
- SEO title/description generator
- Thumbnail concept suggestions

Save hours of scriptwriting time while maintaining your unique voice.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 67,
    organization: placeholderOrgId,
    previewData: { connections: 22, nodes: 15 },
    previewImages: [
      'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=1200&h=800&fit=crop',
    ],
    price: 2999, // $29.99
    publishedAt: new Date('2024-08-10'),
    purchases: 94,
    rating: 4.6,
    revenue: 281906,
    reviewCount: 32,
    seller: sellerIds['automation-pro'],
    shortDescription:
      'Professional video scripts for YouTube, TikTok, and courses with AI assistance.',
    slug: 'ai-video-script-writer',
    status: 'published',
    tags: ['video', 'content', 'scripts', 'youtube', 'tiktok', 'courses'],
    thumbnail:
      'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&h=400&fit=crop',
    title: 'AI Video Script Writer',
    type: 'workflow',
    version: '1.2.0',
    views: 1876,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# Instagram Carousel Creator

Turn ideas into shareable carousel posts that grow your following.

## Carousel Types
- **Educational** - Step-by-step guides and tutorials
- **Listicles** - Top 10 lists, tips, and resources
- **Storytelling** - Narrative-driven content
- **Behind the Scenes** - Process and journey posts
- **Data Visualization** - Stats and infographics

## Design Features
- 50+ slide templates
- Consistent brand styling
- Auto-generated cover slides
- Swipe indicators
- CTA slides

## Content Generation
- Outline generator from topic
- Copy optimization for each slide
- Hashtag strategy included
- Caption templates

## Export Options
- Individual PNG slides
- PDF presentation
- Canva integration
- Direct Figma export

Grow your Instagram with content that actually gets saved and shared.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 234,
    organization: placeholderOrgId,
    previewData: { connections: 14, nodes: 10 },
    previewImages: [
      'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=1200&h=800&fit=crop',
    ],
    price: 1499, // $14.99
    publishedAt: new Date('2024-05-05'),
    purchases: 312,
    rating: 4.8,
    revenue: 467688,
    reviewCount: 98,
    seller: sellerIds['content-craft'],
    shortDescription:
      'Design stunning Instagram carousels that educate and engage your audience.',
    slug: 'instagram-carousel-creator',
    status: 'published',
    tags: ['social', 'instagram', 'images', 'carousel', 'design'],
    thumbnail:
      'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=600&h=400&fit=crop',
    title: 'Instagram Carousel Creator',
    type: 'workflow',
    version: '2.0.0',
    views: 4521,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# Podcast Show Notes Generator

Transform your podcast episodes into SEO-optimized show notes in minutes.

## What You Get
- **Episode Summary** - Compelling description for podcast platforms
- **Key Takeaways** - Bullet points of main insights
- **Timestamps** - Automatic chapter markers
- **Quote Extraction** - Shareable quotes from the episode
- **Resource Links** - Mentioned resources compiled
- **Guest Bio** - Formatted guest information

## SEO Features
- Keyword optimization
- Meta descriptions
- Blog post version
- Newsletter snippet

## Integrations
- Transistor.fm
- Buzzsprout
- Anchor
- Spotify for Podcasters
- Apple Podcasts Connect

## Input Options
- Audio file upload
- RSS feed URL
- Transcript paste
- YouTube video URL

**Free to use** - Perfect for podcasters of all sizes!`,
    downloadData: {},
    downloads: 1123,
    isDeleted: false,
    likeCount: 145,
    organization: placeholderOrgId,
    previewData: { connections: 10, nodes: 7 },
    previewImages: [
      'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1200&h=800&fit=crop',
    ],
    price: 0, // Free
    publishedAt: new Date('2024-09-01'),
    purchases: 1123,
    rating: 4.7,
    revenue: 0,
    reviewCount: 67,
    seller: sellerIds['automation-pro'],
    shortDescription:
      'Automatically generate comprehensive show notes from your podcast audio.',
    slug: 'podcast-show-notes-generator',
    status: 'published',
    tags: ['audio', 'content', 'podcast', 'automation', 'free', 'seo'],
    thumbnail:
      'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&h=400&fit=crop',
    title: 'Podcast Show Notes Generator',
    type: 'workflow',
    version: '1.1.0',
    views: 3245,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# LinkedIn Post Optimizer

Write LinkedIn posts that get engagement from the people who matter.

## Post Formats
- **Thought Leadership** - Position yourself as an expert
- **Story Posts** - Personal narratives that connect
- **How-To Guides** - Actionable advice posts
- **Engagement Bait** - Poll and question posts
- **Carousel Text** - Document post content

## Optimization Features
- Hook analyzer (first 2 lines critical)
- Line break optimization
- Emoji placement strategy
- Hashtag research
- Best posting time suggestions

## Analytics
- Engagement prediction score
- Readability analysis
- Sentiment check
- Length optimization

## Bonus Templates
- 30-day content calendar
- Comment response templates
- Connection message templates

Professional LinkedIn presence made easy.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 78,
    organization: placeholderOrgId,
    previewData: { connections: 7, nodes: 5 },
    previewImages: [
      'https://images.unsplash.com/photo-1611944212129-29977ae1398c?w=1200&h=800&fit=crop',
    ],
    price: 799, // $7.99
    publishedAt: new Date('2024-07-20'),
    purchases: 198,
    rating: 4.5,
    revenue: 158202,
    reviewCount: 45,
    seller: sellerIds['content-craft'],
    shortDescription:
      'Craft LinkedIn posts that build authority and generate leads.',
    slug: 'linkedin-post-optimizer',
    status: 'published',
    tags: ['social', 'linkedin', 'professional', 'content', 'b2b'],
    thumbnail:
      'https://images.unsplash.com/photo-1611944212129-29977ae1398c?w=600&h=400&fit=crop',
    title: 'LinkedIn Post Optimizer',
    type: 'workflow',
    version: '1.4.0',
    views: 2890,
  },
  {
    canBeSoldSeparately: true,
    currency: 'usd',
    description: `# Newsletter Content Curator

Build newsletters that get opened, read, and shared.

## Curation Features
- **RSS Feed Aggregation** - Pull from your favorite sources
- **AI Summarization** - Condense articles into snippets
- **Relevance Scoring** - Surface the most important stories
- **Category Organization** - Auto-sort by topic

## Content Generation
- Original commentary writer
- Intro/outro templates
- Subject line generator (A/B test ready)
- Preview text optimizer

## Newsletter Formats
- Weekly roundup
- Daily digest
- Monthly deep dive
- Breaking news
- Sponsored content integration

## Integrations
- Beehiiv
- Substack
- ConvertKit
- Mailchimp
- Ghost

## Templates
- 10 newsletter layouts
- Welcome sequence (5 emails)
- Re-engagement sequence

Your audience deserves great content. This workflow helps you deliver it consistently.`,
    downloadData: {},
    downloads: 0,
    isDeleted: false,
    likeCount: 56,
    organization: placeholderOrgId,
    previewData: { connections: 20, nodes: 14 },
    previewImages: [
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&h=800&fit=crop',
      'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=1200&h=800&fit=crop',
    ],
    price: 2499, // $24.99
    publishedAt: new Date('2024-10-01'),
    purchases: 76,
    rating: 4.9,
    revenue: 189924,
    reviewCount: 28,
    seller: sellerIds['workflow-wizard'],
    shortDescription:
      'Curate and create newsletter content that your subscribers will love.',
    slug: 'newsletter-content-curator',
    status: 'published',
    tags: ['content', 'automation', 'newsletter', 'email', 'curation'],
    thumbnail:
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&h=400&fit=crop',
    title: 'Newsletter Content Curator',
    type: 'workflow',
    version: '1.0.0',
    views: 1654,
  },
];

// ============================================================================
// RUN SEED
// ============================================================================

const args = parseArgs();

runScript(
  'Marketplace Seed',
  async (db) => {
    // Seed sellers first
    logger.log('\n📦 Seeding Sellers...\n');
    const sellerResult = await seedDocuments(db, SELLER_COLLECTION, sellers, {
      dryRun: args.dryRun,
      fieldsToCheck: SELLER_FIELDS_TO_CHECK,
      keyField: 'slug',
    });

    // Get seller IDs from database for listings
    const sellersCollection = db.collection('sellers');
    const sellerDocs = await sellersCollection
      .find({ slug: { $in: Object.keys(sellerIds) } })
      .toArray();
    const sellerIdMap = new Map(sellerDocs.map((s) => [s.slug, s._id]));

    // Update listings with real seller IDs
    const updatedListings = listings.map((listing) => {
      const sellerSlug = Object.entries(sellerIds).find(([, id]) =>
        id.equals(listing.seller),
      )?.[0];
      const realSellerId = sellerSlug
        ? sellerIdMap.get(sellerSlug)
        : listing.seller;
      return {
        ...listing,
        seller: realSellerId || listing.seller,
      };
    });

    // Seed listings
    logger.log('\n📦 Seeding Listings...\n');
    const listingResult = await seedDocuments(
      db,
      LISTING_COLLECTION,
      updatedListings,
      {
        dryRun: args.dryRun,
        fieldsToCheck: LISTING_FIELDS_TO_CHECK,
        keyField: 'slug',
      },
    );

    return {
      listings: listingResult,
      sellers: sellerResult,
    };
  },
  { database: args.database, uri: args.uri },
).catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});
