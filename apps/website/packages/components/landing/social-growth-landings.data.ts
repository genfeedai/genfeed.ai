import type {
  ServiceLandingConfig,
  ServiceLandingFaq,
} from '@web-components/landing/service-landings.data';
import {
  Briefcase,
  CalendarRange,
  Clapperboard,
  Film,
  ImageIcon,
  LayoutGrid,
  MessageCircle,
  Play,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

/**
 * One growth page per social platform, each built to be the link in that
 * platform's bio. Every page offers the same two paths as the rest of the
 * landing group: run the loop yourself on Genfeed, or book a call and we run it.
 * Only list a platform here once Genfeed can publish to it.
 */

interface SocialGrowthFaqCopy {
  /** Platform display name, e.g. "LinkedIn". */
  platform: string;
  /** Who the page is for, answering "Who is this for?". */
  audience: string;
  /** What the self-serve workspace does on this platform. */
  selfServe: string;
  /**
   * Tactics we refuse on this platform, completing "We do not …" in the
   * fake-engagement answer.
   */
  refusedTactics: string;
  /** What done-for-you pricing is scoped around on this platform. */
  pricingScope: string;
}

function socialGrowthFaqs({
  audience,
  platform,
  pricingScope,
  refusedTactics,
  selfServe,
}: SocialGrowthFaqCopy): ServiceLandingFaq[] {
  return [
    { answer: audience, question: 'Who is this for?' },
    {
      answer: `Yes. Start free, connect your ${platform} account, and use Genfeed for ${selfServe} yourself. If you would rather hand it off, book a call and we run the same loop for you.`,
      question: 'Can I run it myself instead of hiring you?',
    },
    {
      answer:
        'Yes. We calibrate on your past posts, notes, and calls, and nothing ships without your approval. The goal is your point of view, published more often.',
      question: 'Will it sound like me?',
    },
    {
      answer: `No. Genfeed handles the research, production, scheduling, and analytics. We do not ${refusedTactics}, or use anything that puts the account at risk.`,
      question: 'Is this bots and fake engagement?',
    },
    {
      answer:
        'It depends on your niche, your starting point, and how much of your perspective we can publish. We do not promise follower counts. We commit to a steady cadence and a weekly loop on what the data says.',
      question: 'How fast will the account grow?',
    },
    {
      answer:
        'One voice-calibration session at the start, then a few minutes a day to approve the queue.',
      question: 'How much of my time does it take?',
    },
    {
      answer: `Self-serve starts free on pay-as-you-go. Done-for-you is scoped on the call around ${pricingScope}.`,
      question: 'How does pricing work?',
    },
  ];
}

function socialGrowthProcess(
  shipDescription: string,
): ServiceLandingConfig['process'] {
  return [
    {
      description:
        'We review your account, audience, and what has worked so far.',
      step: 'Audit',
    },
    {
      description:
        'We set your voice and content pillars in your Genfeed workspace.',
      step: 'Calibrate',
    },
    { description: shipDescription, step: 'Ship' },
    {
      description:
        'We read the analytics weekly and double down on what grows the account.',
      step: 'Compound',
    },
  ];
}

const SOCIAL_GROWTH_FIT_LABEL = 'Good Fit Signals';
const SOCIAL_GROWTH_FAQ_DESCRIPTION = 'What people usually ask before booking.';
const SOCIAL_GROWTH_PROCESS_DESCRIPTION =
  'A steady operating rhythm with your approval at the center.';

export const socialGrowthLandingConfigs: ServiceLandingConfig[] = [
  {
    badge: 'X Growth',
    closingDescription:
      'Start free and run the X growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Grow On X Without Living On X',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Voice calibration from your past posts and notes',
          'Target accounts and conversations to show up in',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Daily posts with hooks written for the timeline',
          'Threads built from your long-form, calls, and notes',
          'Short video clips and visuals sized for X',
          'Reply and quote-post drafts on relevant conversations',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience is online',
          'Tracking impressions, replies, reposts, and profile clicks',
          'Doubling down on the topics and formats that grow followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full X growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: [
      {
        answer:
          'Founders, operators, and brands where X drives deals, hiring, fundraising, or distribution, and the account underperforms because nobody owns it day to day.',
        question: 'Who is this for?',
      },
      {
        answer:
          'Yes. Start free, connect your X account, and use Genfeed for trend monitoring, drafting, scheduling, and analytics yourself. If you would rather hand it off, book a call and we run the same loop for you.',
        question: 'Can I run it myself instead of hiring you?',
      },
      {
        answer:
          'Yes. We calibrate on your past posts, notes, and calls, and nothing ships without your approval. The goal is your point of view, published more often.',
        question: 'Will it sound like me?',
      },
      {
        answer:
          'Genfeed handles trend monitoring, drafting, scheduling, and analytics. We do not buy followers, run engagement pods, or use follow/unfollow tactics that put the account at risk.',
        question: 'Is this bots and fake engagement?',
      },
      {
        answer:
          'It depends on your niche, your starting point, and how much of your perspective we can publish. We do not promise follower counts. We commit to daily output and a weekly loop on what the data says.',
        question: 'How fast will the account grow?',
      },
      {
        answer:
          'One voice-calibration session at the start, then a few minutes a day to approve the queue. Reply personally whenever you want; we cover the rest.',
        question: 'How much of my time does it take?',
      },
      {
        answer:
          'Self-serve starts free on pay-as-you-go. Done-for-you is scoped on the call around posting volume, format mix (text, threads, video), and how much reply coverage you want.',
        question: 'How does pricing work?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers, investors, or future hires already read X, and your account is not where it should be.',
      'You have opinions and expertise, but posting daily and replying in real time does not fit your calendar.',
      'You want an account that sounds like you, not like an engagement-bait ghostwriter.',
    ],
    heroAccent: 'X account',
    heroDescription:
      'Genfeed runs the X (Twitter) growth loop: trends, daily posts and threads in your voice, replies, video, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'X growth strategy and content pillars',
      'Voice calibration',
      'Daily posts and threads',
      'Video clips and visuals',
      'Trend monitoring in your niche',
      'Reply and quote-post drafts',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'X rewards accounts that show up every day with a sharp point of view and join the conversation while it is still moving. Almost nobody can sustain that on top of a real job. Genfeed handles trend monitoring, drafting in your voice, replies, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your X (Twitter) account with Genfeed: trend alerts, posts and threads in your voice, reply drafts, and analytics. Start free or have us run it.',
    metaTitle: 'X (Twitter) Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Genfeed watches the trends and conversations in your niche, so your takes land while the topic is still moving.',
        icon: TrendingUp,
        title: 'Timely, Not Late',
      },
      {
        description:
          'A steady queue of posts, threads, and clips, scheduled for when your audience is actually online.',
        icon: CalendarRange,
        title: 'A Daily Cadence',
      },
      {
        description:
          'Reply and quote-post drafts on the accounts that matter in your space, the fastest way in front of new followers.',
        icon: MessageCircle,
        title: 'Replies That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on X comes from consistency, timing, and conversation. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: [
      {
        description:
          'We review your account, audience, and what has worked so far.',
        step: 'Audit',
      },
      {
        description:
          'We set your voice and content pillars in your Genfeed workspace.',
        step: 'Calibrate',
      },
      {
        description:
          'Posts, threads, and replies go out every day, with your approval.',
        step: 'Ship daily',
      },
      {
        description:
          'We read the analytics weekly and double down on what grows the account.',
        step: 'Compound',
      },
    ],
    processDescription:
      'A daily operating rhythm with your approval at the center.',
    processTitle: 'How It Works',
    slug: 'x-growth',
    title: 'X Growth Service',
  },
  {
    badge: 'LinkedIn Growth',
    closingDescription:
      'Start free and run the LinkedIn growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Become The Name Your Buyers Already Know',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars your buyers care about',
          'Voice calibration from your past posts, calls, and notes',
          'The creators and conversations your buyers follow',
          'Weekly themes tied to your launches, wins, and opinions',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Text posts with hooks that earn the "see more" click',
          'Image posts and native video clips cut from your calls',
          'Carousel slide designs from your frameworks and data',
          'Comment drafts on the posts your buyers are reading',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to your profile when your network is at work',
          'Tracking impressions, reactions, comments, and profile views',
          'Doubling down on the topics that start sales conversations',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full LinkedIn growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the profile, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Founders, consultants, and B2B operators whose buyers, hires, or investors check LinkedIn before they reply, and whose profile goes quiet because nobody owns it week to week.',
      platform: 'LinkedIn',
      pricingScope:
        'posting volume, format mix (text, image, video, carousel), and how much comment coverage you want',
      refusedTactics:
        'buy followers, run engagement pods, or send automated connection and DM sequences',
      selfServe: 'topic research, drafting, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers look you up on LinkedIn before a call, and your profile does not reflect what you actually know.',
      'You post in bursts, then go quiet for weeks when real work takes over.',
      'You want posts that sound like an operator, not like a broetry ghostwriter.',
    ],
    heroAccent: 'LinkedIn audience',
    heroDescription:
      'Genfeed runs the LinkedIn growth loop: topic research, posts in your voice, video and carousels, comment drafts, scheduling, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'LinkedIn strategy and content pillars',
      'Voice calibration',
      'Posts several times a week',
      'Native video and carousel slides',
      'Topic research in your industry',
      'Comment drafts on buyer conversations',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'LinkedIn rewards people who post a clear point of view every week and show up in the comments of the conversations their buyers read. That is a second job on top of running the business. Genfeed handles research, drafting in your voice, visuals, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your LinkedIn audience with Genfeed: posts in your voice, video, carousels, comment drafts, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'LinkedIn Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Turn what you already say on calls into posts that make buyers trust you before the first meeting.',
        icon: Briefcase,
        title: 'Authority That Sells',
      },
      {
        description:
          'A steady queue of posts, clips, and carousels, scheduled for when your network is at work.',
        icon: CalendarRange,
        title: 'A Weekly Cadence',
      },
      {
        description:
          'Comment drafts on the posts your buyers already read, the fastest way in front of the right new followers.',
        icon: MessageCircle,
        title: 'Comments That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on LinkedIn comes from a sharp point of view, consistency, and showing up in the comments. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Posts, clips, and comment drafts go out every week, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'linkedin-growth',
    title: 'LinkedIn Growth Service',
  },
  {
    badge: 'Instagram Growth',
    closingDescription:
      'Start free and run the Instagram growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Post Like A Media Team Without Hiring One',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Visual direction that fits your brand',
          'Reel formats and trending audio in your space',
          'Weekly themes tied to your launches and offers',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Reels with hooks built for the first second',
          'Carousels that get saved and shared',
          'Feed images and visual variations',
          'Captions, CTAs, and hashtags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to the feed and Reels',
          'Tracking reach, saves, shares, and follows',
          'Doubling down on the formats that bring new followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Instagram growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Creators, founders, and consumer brands where Instagram drives sales, bookings, or community, and the account stalls because producing Reels every week is a production job nobody has time for.',
      platform: 'Instagram',
      pricingScope:
        'posting volume, format mix (Reels, carousels, feed images), and how much new video production you need',
      refusedTactics:
        'buy followers, run engagement pods, or mass follow, unfollow, and DM',
      selfServe:
        'trend research, image and video generation, captions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your customers find you on Instagram, and the account is not posting enough to be found.',
      'You know Reels are the growth lever, but editing video every week does not fit your calendar.',
      'You want content that looks like your brand, not like a stock-template account.',
    ],
    heroAccent: 'Instagram',
    heroDescription:
      'Genfeed runs the Instagram growth loop: trends, Reels and carousels in your style, captions, scheduling, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'Instagram strategy and content pillars',
      'Visual and voice calibration',
      'Reels every week',
      'Carousels and feed images',
      'Trend and audio research in your niche',
      'Captions, CTAs, and hashtags',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Instagram rewards accounts that ship Reels consistently, ride formats while they are moving, and make carousels people save. That is a small media team worth of work. Genfeed handles trend research, image and video generation, captions, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your Instagram with Genfeed: Reels, carousels, and captions in your style, trend research, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'Instagram Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Reels, carousels, and images produced every week, without a shoot or an editor on payroll.',
        icon: Clapperboard,
        title: 'Reels Without A Studio',
      },
      {
        description:
          'Genfeed watches the formats and audio moving in your niche, so you post into a trend, not after it.',
        icon: TrendingUp,
        title: 'On Trend, Not Late',
      },
      {
        description:
          'Carousels and Reels built to be saved and shared, the signals that push posts to new accounts.',
        icon: Users,
        title: 'Reach Beyond Followers',
      },
    ],
    outcomesDescription:
      'Growth on Instagram comes from video volume, timing, and shareable posts. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Reels, carousels, and posts go out every week, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'instagram-growth',
    title: 'Instagram Growth Service',
  },
  {
    badge: 'TikTok Growth',
    closingDescription:
      'Start free and run the TikTok growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Post Every Day Without Filming Every Day',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Hook formats that work in your category',
          'Trending sounds and formats to ride',
          'Weekly themes tied to your launches and offers',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Short videos with hooks built for the first second',
          'Clips cut from your podcasts, calls, and long-form',
          'Photo carousels for the slideshow format',
          'Captions, on-screen text, and hashtags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience scrolls',
          'Tracking views, watch time, shares, and follows',
          'Doubling down on the hooks and formats that go wide',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full TikTok growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Creators, founders, and consumer brands that know their audience is on TikTok but cannot sustain the daily video volume the algorithm rewards.',
      platform: 'TikTok',
      pricingScope:
        'posting volume, how much is clipped from your footage versus produced new, and the format mix (video, photo carousels)',
      refusedTactics: 'buy followers or views, or run engagement pods',
      selfServe:
        'trend and sound research, video generation and clipping, captions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your audience is on TikTok and you are posting a few times a month when the algorithm wants daily.',
      'You have long-form footage, podcasts, or calls that never get cut into clips.',
      'You want videos that feel native to the feed, not like repurposed ads.',
    ],
    heroAccent: 'TikTok',
    heroDescription:
      'Genfeed runs the TikTok growth loop: trends and sounds, daily short videos and clips, captions, scheduling, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'TikTok strategy and content pillars',
      'Hook and voice calibration',
      'Daily short videos',
      'Clips from your long-form',
      'Trend and sound research',
      'Photo carousels',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'TikTok rewards accounts that post every day, test hooks fast, and jump on formats while they are still climbing. Almost nobody can film and edit at that pace. Genfeed handles trend research, video generation and clipping, captions, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your TikTok with Genfeed: daily short videos and clips, trend and sound research, captions, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'TikTok Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'A daily queue of short videos and clips, without filming or editing every day.',
        icon: Film,
        title: 'Daily Volume',
      },
      {
        description:
          'Genfeed watches the sounds and formats climbing in your niche, so you post into a trend, not after it.',
        icon: TrendingUp,
        title: 'On Trend, Not Late',
      },
      {
        description:
          'More hooks tested every week means you find the ones that break out of your follower base faster.',
        icon: Target,
        title: 'Hooks That Get Tested',
      },
    ],
    outcomesDescription:
      'Growth on TikTok comes from volume, timing, and testing hooks. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Short videos and carousels go out every day, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'tiktok-growth',
    title: 'TikTok Growth Service',
  },
  {
    badge: 'YouTube Growth',
    closingDescription:
      'Start free and run the YouTube growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Build The Channel Without Becoming An Editor',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Topics people are already searching for',
          'A Shorts and long-form mix that feeds each other',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Shorts cut from your long-form, podcasts, and calls',
          'Long-form scripts and outlines',
          'Title and thumbnail concepts built for the click',
          'Descriptions, chapters, and tags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling uploads on a steady cadence',
          'Tracking views, watch time, and subscribers',
          'Doubling down on the topics that bring subscribers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full YouTube growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the channel, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Founders, experts, and brands with things worth watching, where YouTube search could bring buyers for years, and the channel stalls because editing and packaging take longer than recording.',
      platform: 'YouTube',
      pricingScope:
        'upload volume, how many Shorts are cut from each long-form video, and how much scripting and packaging you need',
      refusedTactics: 'buy views or subscribers, or run sub-for-sub schemes',
      selfServe:
        'topic research, Shorts clipping, titles and descriptions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers search YouTube for the problems you solve, and your channel is not showing up.',
      'You record long-form, podcasts, or webinars that never get turned into Shorts.',
      'You want a channel that compounds in search, not one upload a quarter.',
    ],
    heroAccent: 'YouTube channel',
    heroDescription:
      'Genfeed runs the YouTube growth loop: topic research, Shorts from your long-form, titles and thumbnails, scheduling, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'YouTube strategy and content pillars',
      'Voice calibration',
      'Shorts every week',
      'Long-form scripts and outlines',
      'Search-driven topic research',
      'Titles, thumbnails, and descriptions',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'YouTube rewards channels that pick searchable topics, package them well, and feed the channel with Shorts between long-form uploads. The recording is the easy part; the editing and packaging are what stall most channels. Genfeed handles topic research, clipping, titles and descriptions, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your YouTube channel with Genfeed: topic research, Shorts from your long-form, titles and thumbnails, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'YouTube Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Every long-form video, podcast, or call becomes a week of Shorts that send viewers back to the channel.',
        icon: Play,
        title: 'Shorts From Everything',
      },
      {
        description:
          'Topics picked from what people already search, so videos keep bringing views long after upload.',
        icon: Search,
        title: 'Found In Search',
      },
      {
        description:
          'Titles and thumbnails worked as hard as the video, because the click decides whether anyone watches.',
        icon: ImageIcon,
        title: 'Packaging That Gets Clicked',
      },
    ],
    outcomesDescription:
      'Growth on YouTube comes from searchable topics, packaging, and a steady upload rhythm. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Shorts and long-form uploads go out on schedule, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'youtube-growth',
    title: 'YouTube Growth Service',
  },
  {
    badge: 'Threads Growth',
    closingDescription:
      'Start free and run the Threads growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Show Up In The Conversation Every Day',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Voice calibration from your past posts and notes',
          'Topics and conversations to show up in',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Daily text posts with a sharp point of view',
          'Multi-part posts built from your long-form',
          'Image and video carousels',
          'Reply drafts on relevant conversations',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience is online',
          'Tracking views, replies, reposts, and follows',
          'Doubling down on the topics that grow followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Threads growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Founders, creators, and brands that already have an Instagram audience or a point of view, and want to build on Threads while the platform is still early.',
      platform: 'Threads',
      pricingScope:
        'posting volume, format mix (text, carousels, video), and how much reply coverage you want',
      refusedTactics:
        'buy followers, run engagement pods, or mass follow and unfollow',
      selfServe: 'trend research, drafting, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'You have an Instagram audience or a point of view, and nothing on Threads to show for it.',
      'You know text-first platforms reward daily posting, and daily does not fit your calendar.',
      'You want to build on a platform while reach is still cheap.',
    ],
    heroAccent: 'Threads',
    heroDescription:
      'Genfeed runs the Threads growth loop: trends, daily posts in your voice, carousels, replies, scheduling, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow on',
    includes: [
      'Threads strategy and content pillars',
      'Voice calibration',
      'Daily posts',
      'Image and video carousels',
      'Trend monitoring in your niche',
      'Reply drafts',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Threads rewards accounts that post every day and join conversations while they are moving, and reach is still cheaper than on older platforms. Genfeed handles trend monitoring, drafting in your voice, carousels, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow on Threads with Genfeed: daily posts in your voice, carousels, reply drafts, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'Threads Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'A steady queue of posts and carousels, scheduled for when your audience is online.',
        icon: CalendarRange,
        title: 'A Daily Cadence',
      },
      {
        description:
          'Genfeed watches the conversations in your niche, so your takes land while the topic is still moving.',
        icon: TrendingUp,
        title: 'Timely, Not Late',
      },
      {
        description:
          'Reply drafts on the accounts that matter in your space, the fastest way in front of new followers.',
        icon: MessageCircle,
        title: 'Replies That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on Threads comes from consistency, timing, and conversation. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Posts, carousels, and replies go out every day, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'threads-growth',
    title: 'Threads Growth Service',
  },
  {
    badge: 'Facebook Growth',
    closingDescription:
      'Start free and run the Facebook growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Keep Your Page Alive Without Babysitting It',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your audience',
          'Voice calibration from your past posts',
          'Topics your community reacts to and shares',
          'Weekly themes tied to your offers, events, and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Reels built for the Facebook feed',
          'Image posts and visual variations',
          'Link posts and announcements that drive clicks',
          'Captions and CTAs',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to your Page on a steady cadence',
          'Tracking reach, reactions, shares, and clicks',
          'Doubling down on the posts that bring new followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Facebook growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the Page, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Local businesses, service brands, and communities whose customers still live on Facebook, and whose Page goes quiet because nobody owns it.',
      platform: 'Facebook',
      pricingScope:
        'posting volume, format mix (Reels, images, link posts), and how much new video production you need',
      refusedTactics:
        'buy Page likes, or run like farms and engagement-bait schemes',
      selfServe:
        'image and video generation, captions, scheduling to your Page, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your customers still find and check you on Facebook, and the Page has not posted in weeks.',
      'You need Reels and posts every week but have nobody to produce them.',
      'You want a Page that looks active and on-brand every time someone checks it.',
    ],
    heroAccent: 'Facebook Page',
    heroDescription:
      'Genfeed runs the Facebook growth loop: Reels, image posts, captions, scheduling, and analytics for your Page. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'Facebook strategy and content pillars',
      'Voice calibration',
      'Posts several times a week',
      'Reels and images',
      'Topic research for your audience',
      'Captions and CTAs',
      'Page scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Facebook still drives real customers for local and community brands, but only for Pages that post consistently and lean into Reels. Genfeed handles image and video generation, captions, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your Facebook Page with Genfeed: Reels, image posts, captions, scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'Facebook Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'A Page that posts several times a week, so everyone who checks you sees an active business.',
        icon: CalendarRange,
        title: 'A Page That Looks Alive',
      },
      {
        description:
          'Reels produced every week, the format Facebook pushes furthest beyond your followers.',
        icon: Clapperboard,
        title: 'Reels Without A Studio',
      },
      {
        description:
          'Posts built to be shared into the groups and feeds where your next customers are.',
        icon: Users,
        title: 'Reach Through Shares',
      },
    ],
    outcomesDescription:
      'Growth on Facebook comes from consistency, video, and shareable posts. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Reels and posts go out every week, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'facebook-growth',
    title: 'Facebook Growth Service',
  },
  {
    badge: 'Pinterest Growth',
    closingDescription:
      'Start free and run the Pinterest growth loop yourself on Genfeed, or book a call and we will run it for you.',
    closingTitle: 'Turn Pinterest Into A Traffic Channel',
    deliverableBuckets: [
      {
        items: [
          'Keywords your buyers search on Pinterest',
          'Board structure around your products and topics',
          'Seasonal themes planned ahead of the search curve',
          'Visual direction that fits your brand',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Fresh pin images for every product and post',
          'Several design variations per link',
          'Keyword-rich titles and descriptions',
          'Destination links to your site, shop, or blog',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling pins to the right boards',
          'Tracking impressions, saves, and outbound clicks',
          'Doubling down on the pins that drive traffic',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Pinterest growth loop inside your Genfeed workspace. Run it yourself, or have us run it. Either way you keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'E-commerce brands, bloggers, and creators in visual niches (home, food, fashion, travel, design) where Pinterest search can send buyers to the site for months.',
      platform: 'Pinterest',
      pricingScope:
        'pin volume, how many products or posts we cover, and how many design variations you want per link',
      refusedTactics:
        'buy followers, spam group boards, or mass follow and unfollow',
      selfServe:
        'keyword research, pin image generation, descriptions, scheduling to your boards, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'You sell or write about something visual, and Pinterest is sending you almost no traffic.',
      'You know Pinterest wants fresh pins every week, and designing them does not fit your calendar.',
      'You want traffic that keeps coming for months, not a post that dies in a day.',
    ],
    heroAccent: 'Pinterest traffic',
    heroDescription:
      'Genfeed runs the Pinterest growth loop: keyword research, fresh pin images, descriptions, scheduling to your boards, and analytics. Start free and run it yourself, or book a call and we run it for you.',
    heroTitle: 'Grow your',
    includes: [
      'Pinterest strategy and keyword map',
      'Visual calibration',
      'Fresh pins every week',
      'Design variations per link',
      'Seasonal planning',
      'Titles and descriptions',
      'Board scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Pinterest is a search engine that rewards fresh pins, good keywords, and consistency, and a pin can send clicks for months. Most brands stop after a few boards because designing pins every week is tedious. Genfeed handles keyword research, pin image generation, descriptions, scheduling, and analytics. Run it yourself, or let us run it while you approve what ships.',
    metaDescription:
      'Grow your Pinterest traffic with Genfeed: keyword research, fresh pin images, descriptions, board scheduling, and analytics. Start free or have us run it.',
    metaTitle: 'Pinterest Growth Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Pins built around what your buyers type into Pinterest search, so they keep surfacing long after they go live.',
        icon: Search,
        title: 'Found In Search',
      },
      {
        description:
          'Several fresh designs per product or post every week, without a designer on payroll.',
        icon: LayoutGrid,
        title: 'Fresh Pins, Every Week',
      },
      {
        description:
          'Every pin links to your site, shop, or blog, so growth shows up as visits, not just saves.',
        icon: Target,
        title: 'Traffic, Not Vanity',
      },
    ],
    outcomesDescription:
      'Growth on Pinterest comes from keywords, fresh pins, and consistency. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: socialGrowthProcess(
      'Fresh pins go out to your boards every week, with your approval.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'pinterest-growth',
    title: 'Pinterest Growth Service',
  },
];

export const socialGrowthSlugs = socialGrowthLandingConfigs.map(
  (config) => config.slug,
);
