import { contentServiceOffering } from '@helpers/business/pricing/pricing.helper';
import type { ComponentType, SVGProps } from 'react';
import {
  LuBadgeCheck,
  LuCalendarRange,
  LuClapperboard,
  LuFileText,
  LuMegaphone,
  LuMic,
  LuRadio,
  LuRocket,
  LuSparkles,
  LuUsers,
} from 'react-icons/lu';

type LandingIcon = ComponentType<
  SVGProps<SVGSVGElement> & { className?: string }
>;

export interface ServiceLandingFaq {
  question: string;
  answer: string;
}

export interface ServiceLandingCard {
  title: string;
  description: string;
  icon: LandingIcon;
}

export interface ServiceLandingBucket {
  title: string;
  items: string[];
}

export interface ServiceLandingConfig {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  intro: string;
  fitLabel: string;
  fitSignals: string[];
  outcomesTitle: string;
  outcomesDescription: string;
  outcomes: ServiceLandingCard[];
  deliverablesTitle: string;
  deliverablesDescription: string;
  deliverableBuckets: ServiceLandingBucket[];
  includes: string[];
  processTitle: string;
  processDescription: string;
  process: { step: string; description: string }[];
  faqTitle: string;
  faqDescription: string;
  faqs: ServiceLandingFaq[];
  closingTitle: string;
  closingDescription: string;
}

const COMMON_SERVICE_PROCESS = contentServiceOffering.process;
const COMMON_SERVICE_INCLUDES = contentServiceOffering.includes;

export const serviceLandingConfigs: ServiceLandingConfig[] = [
  {
    badge: 'Done-For-You',
    closingDescription:
      'This page is intentionally simple: if the model fits, book a call and we will scope the engagement.',
    closingTitle: 'If You Need Content Volume Without Building a Team',
    deliverableBuckets: [
      {
        items: [
          'Monthly content themes',
          'Weekly production priorities',
          'Platform-level publishing plan',
          'Review cadence and approvals',
        ],
        title: 'Planning',
      },
      {
        items: [
          'Short-form video concepts and edits',
          'Image generation and visual variations',
          'Scripts, hooks, and captions',
          'Repurposed content from raw source material',
        ],
        title: 'Production',
      },
      {
        items: [
          'Publishing coordination',
          'Content calendar management',
          'Revision rounds',
          'Performance review and iteration',
        ],
        title: 'Operations',
      },
    ],
    deliverablesDescription: contentServiceOffering.description,
    deliverablesTitle: 'What You Get',
    faqDescription: 'Direct answers before the call.',
    faqs: [
      {
        answer:
          'This is built for high-end SMBs with real content demand: founder-led companies, service businesses, and operators who need consistent publishing without building an internal team.',
        question: 'Who is this for?',
      },
      {
        answer:
          'It covers strategy, content planning, production, revision handling, and publishing coordination. The exact scope is shaped around your channel mix and monthly content volume.',
        question: 'What does the retainer actually cover?',
      },
      {
        answer:
          'No. You stay involved at the approval and direction level. We are deliberately reducing coordination load, not creating another meeting-heavy workflow.',
        question: 'Do I need to be heavily involved every week?',
      },
      {
        answer:
          'Once aligned on fit, we start with a discovery call and move into calendar planning immediately. The first production cycle starts after that intake is complete.',
        question: 'How fast can we start?',
      },
      {
        answer:
          'Engagements start at $2,500 per month and scale with content volume, channel complexity, and review requirements.',
        question: 'What does pricing look like?',
      },
      {
        answer:
          'We review your current content bottlenecks, target output, channels, and fit. If the model makes sense, we map the initial engagement scope and next steps.',
        question: 'What happens on the call?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Engagement Fit',
    fitSignals: [
      'You need recurring content volume every month, not a one-off project.',
      'You want an operator who can take rough ideas and turn them into shipped content.',
      'You are replacing internal content coordination, fragmented freelancers, or inconsistent agency execution.',
    ],
    heroAccent: 'content',
    heroDescription:
      'A high-touch content retainer for high-end SMBs that need consistent output without building an internal content team.',
    heroTitle: 'We run your',
    includes: COMMON_SERVICE_INCLUDES,
    intro:
      'You bring the expertise, raw ideas, customer context, and final approvals. We handle strategy, production, and publishing so your brand shows up consistently without creating another layer of internal coordination.',
    metaDescription:
      'Done-for-you content retainer for high-end SMBs. Strategy, production, and publishing handled for you.',
    metaTitle: 'Done-For-You Content | Genfeed.ai',
    outcomes: [
      {
        description:
          'Turn founder insights, sales calls, customer questions, and product updates into a weekly publishing system.',
        icon: LuFileText,
        title: 'Strategy Into Output',
      },
      {
        description:
          'Ship short-form video, images, scripts, hooks, captions, and publishing-ready assets without building an in-house team.',
        icon: LuClapperboard,
        title: 'Multi-Format Production',
      },
      {
        description:
          'Keep a consistent voice across channels while moving fast enough to support launches, campaigns, and ongoing demand.',
        icon: LuMic,
        title: 'Consistent Brand Presence',
      },
    ],
    outcomesDescription:
      'Built for businesses that already know content matters but do not want to manage another internal function.',
    outcomesTitle: 'What This Solves',
    process: COMMON_SERVICE_PROCESS,
    processDescription:
      'Clear operating rhythm. Minimal coordination overhead.',
    processTitle: 'How It Works',
    slug: 'done-for-you',
    title: 'Done-For-You Content',
  },
  {
    badge: 'Founder Content',
    closingDescription:
      'If founder-led content is bottlenecked by time, consistency, or execution, the next step is a call.',
    closingTitle: 'Founder-Led Content Without Founder-Led Production',
    deliverableBuckets: [
      {
        items: [
          'Founder voice and messaging calibration',
          'Topic bank from calls, notes, and product updates',
          'Weekly publishing themes',
          'Approval workflow built around your schedule',
        ],
        title: 'Message System',
      },
      {
        items: [
          'LinkedIn posts and threads',
          'Short-form founder videos',
          'Repurposed clips from calls or podcasts',
          'Supporting visuals and captions',
        ],
        title: 'Content Output',
      },
      {
        items: [
          'Publishing schedule management',
          'Revision handling',
          'Audience-response loop',
          'Iteration on themes that resonate',
        ],
        title: 'Execution',
      },
    ],
    deliverablesDescription:
      'Everything required to turn founder ideas into consistent published content without building an internal content function.',
    deliverablesTitle: 'What The Engagement Covers',
    faqDescription: 'What founders usually want to know before booking.',
    faqs: [
      {
        answer:
          'Founder-led companies, agencies, and service businesses where the founder has strong insights but no time to turn them into consistent content.',
        question: 'Who is this best for?',
      },
      {
        answer:
          'No. You provide raw material and final direction. We handle content shaping, production, and publishing coordination.',
        question: 'Will this still sound like me?',
      },
      {
        answer:
          'Voice notes, customer calls, podcast clips, product updates, sales conversations, rough bullet points, and previous content all work.',
        question: 'What input do you need from me?',
      },
      {
        answer:
          'The goal is consistent founder presence with low overhead. We design the workflow around limited founder availability.',
        question: 'How much time does this take from me weekly?',
      },
      {
        answer:
          'Founder-content retainers start from the same done-for-you floor and scale with channel mix, production intensity, and revision load.',
        question: 'How is pricing structured?',
      },
      {
        answer:
          'We assess whether founder-led content is actually the right growth lever, then scope cadence, channels, and operating model.',
        question: 'What happens on the call?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Good Fit Signals',
    fitSignals: [
      'Your audience buys because of founder expertise, perspective, or trust.',
      'You already have useful raw material trapped in calls, notes, or voice messages.',
      'Content is important, but the founder cannot be the production bottleneck anymore.',
    ],
    heroAccent: 'founder content',
    heroDescription:
      'We turn founder ideas, voice notes, customer conversations, and product updates into consistent published content.',
    heroTitle: 'We run your',
    includes: [
      'Founder voice positioning',
      'Topic extraction from source material',
      'LinkedIn-first content planning',
      'Video and text production',
      'Publishing coordination',
      'Revision rounds',
      'Feedback loop on audience response',
      'Monthly content planning',
    ],
    intro:
      'Most founder-led brands do not lack ideas. They lack a reliable operator who can pull signal out of the founder’s brain and turn it into published content every week.',
    metaDescription:
      'Founder content service for high-end SMBs. Turn founder ideas, calls, and updates into consistent published content.',
    metaTitle: 'Founder Content Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Extract strong content angles from calls, product updates, and rough founder notes.',
        icon: LuSparkles,
        title: 'Capture The Signal',
      },
      {
        description:
          'Turn those inputs into posts, videos, hooks, and content systems that feel founder-led instead of agency-written.',
        icon: LuUsers,
        title: 'Keep The Founder Voice',
      },
      {
        description:
          'Publish consistently enough to build demand without the founder manually pushing every piece across the line.',
        icon: LuCalendarRange,
        title: 'Remove The Bottleneck',
      },
    ],
    outcomesDescription:
      'This is for companies where the founder is the strongest content asset, but execution is inconsistent.',
    outcomesTitle: 'What This Solves',
    process: COMMON_SERVICE_PROCESS,
    processDescription:
      'We keep the operating model simple so the founder stays high-leverage.',
    processTitle: 'How It Works',
    slug: 'founder-content',
    title: 'Founder Content Service',
  },
  {
    badge: 'LinkedIn Content',
    closingDescription:
      'If LinkedIn is a real revenue channel for your business, this page should end with one action: book the call.',
    closingTitle: 'LinkedIn Content For Companies That Need Consistency',
    deliverableBuckets: [
      {
        items: [
          'Positioning and audience-angle mapping',
          'Monthly content themes',
          'Post cadence planning',
          'Message hierarchy by funnel stage',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Founder and brand posts',
          'Carousel and text-post concepts',
          'Video scripts and clips',
          'Hooks, CTAs, and repurposed variants',
        ],
        title: 'Production',
      },
      {
        items: [
          'Publishing support',
          'Iteration based on performance',
          'Angle testing',
          'Content calendar upkeep',
        ],
        title: 'Optimization',
      },
    ],
    deliverablesDescription:
      'A complete LinkedIn content execution layer built to create steady publishing volume without an in-house team.',
    deliverablesTitle: 'What You Get',
    faqDescription:
      'Built for businesses treating LinkedIn like a real growth channel.',
    faqs: [
      {
        answer:
          'B2B companies, founder-led service firms, and high-end SMBs where LinkedIn can drive trust, pipeline, or category positioning.',
        question: 'Who is this for?',
      },
      {
        answer:
          'No. We handle execution, but the strategy is built around your positioning, audience, and commercial reality.',
        question: 'Is this just outsourced posting?',
      },
      {
        answer:
          'Both can work. The right shape depends on whether your audience responds more to personal authority or company positioning.',
        question: 'Should the content be founder-led or brand-led?',
      },
      {
        answer:
          'Yes. The system is designed to create a repeatable posting rhythm rather than one-off bursts.',
        question: 'Can you manage ongoing cadence?',
      },
      {
        answer:
          'Pricing depends on output volume, content format mix, and whether the engagement is founder-led, brand-led, or both.',
        question: 'How does pricing work?',
      },
      {
        answer:
          'We look at your audience, current content engine, bottlenecks, and whether LinkedIn is strategically important enough to justify the retainer.',
        question: 'What happens on the call?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Best Fit',
    fitSignals: [
      'Your buyers spend time on LinkedIn and trust matters in the sales cycle.',
      'Your posting is inconsistent or too dependent on one internal person.',
      'You need a repeatable engine, not random ghostwritten posts.',
    ],
    heroAccent: 'LinkedIn content',
    heroDescription:
      'We plan, produce, and help ship LinkedIn content for high-end SMBs that want consistency, authority, and pipeline support.',
    heroTitle: 'We run your',
    includes: [
      'LinkedIn strategy and calendar',
      'Founder or company voice adaptation',
      'Text posts and carousel angles',
      'Video-script support',
      'Repurposing from source material',
      'Publishing coordination',
      'Angle testing',
      'Revision rounds',
    ],
    intro:
      'LinkedIn works when the message is sharp, the cadence is reliable, and someone owns execution. Most teams fail on the third part.',
    metaDescription:
      'LinkedIn content service for B2B teams and founder-led SMBs. Plan, produce, and publish LinkedIn content consistently.',
    metaTitle: 'LinkedIn Content Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Build a repeatable publishing rhythm that supports trust, category presence, and commercial conversations.',
        icon: LuMegaphone,
        title: 'Consistent Market Presence',
      },
      {
        description:
          'Turn existing expertise into platform-native posts instead of generic ghostwritten content.',
        icon: LuFileText,
        title: 'Stronger Positioning',
      },
      {
        description:
          'Reduce the internal burden of planning, drafting, and shipping content every week.',
        icon: LuBadgeCheck,
        title: 'Lower Execution Friction',
      },
    ],
    outcomesDescription:
      'This page is about one channel, one operating model, and one clear outcome: reliable LinkedIn execution.',
    outcomesTitle: 'What This Solves',
    process: COMMON_SERVICE_PROCESS,
    processDescription:
      'The same service operating model, focused specifically on LinkedIn execution.',
    processTitle: 'How It Works',
    slug: 'linkedin-content',
    title: 'LinkedIn Content Service',
  },
  {
    badge: 'Podcast To Content',
    closingDescription:
      'If you already have conversations worth repurposing, this is usually one of the fastest ways to create quality content volume.',
    closingTitle: 'Turn Recorded Conversations Into Published Content',
    deliverableBuckets: [
      {
        items: [
          'Source-material review',
          'Angle extraction from episodes or calls',
          'Format planning by channel',
          'Publishing priority mapping',
        ],
        title: 'Extraction Plan',
      },
      {
        items: [
          'Short-form clips',
          'Social posts and threads',
          'Article and newsletter drafts',
          'Captions, hooks, and snippets',
        ],
        title: 'Repurposed Assets',
      },
      {
        items: [
          'Editorial sequencing',
          'Revision rounds',
          'Publishing coordination',
          'Topic-bank expansion from new recordings',
        ],
        title: 'Content Engine',
      },
    ],
    deliverablesDescription:
      'A repurposing system that turns podcasts, webinars, interviews, and sales calls into a steady stream of usable marketing content.',
    deliverablesTitle: 'What You Get',
    faqDescription: 'High-intent because the source material already exists.',
    faqs: [
      {
        answer:
          'Podcasts, webinars, interviews, customer conversations, internal recordings, sales calls, and other long-form audio or video sources.',
        question: 'What kind of source material works?',
      },
      {
        answer:
          'No. It is a repurposing and publishing system that extracts distribution-ready assets from material you already have.',
        question: 'Is this just clipping?',
      },
      {
        answer:
          'Video clips, text posts, articles, newsletters, and supporting copy can all be created from one source asset depending on your channels.',
        question: 'What content formats can come out of this?',
      },
      {
        answer:
          'Yes. The service is designed to turn a recurring stream of recordings into a repeatable content pipeline.',
        question: 'Can this run continuously?',
      },
      {
        answer:
          'Pricing depends on recording volume, output mix, and the intensity of editorial refinement needed.',
        question: 'How is pricing handled?',
      },
      {
        answer:
          'We review the source material, target channels, publishing goals, and whether the content opportunity is large enough to justify the engagement.',
        question: 'What happens on the call?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Strong Fit Signals',
    fitSignals: [
      'You already record good conversations but do not fully exploit them.',
      'Your team lacks the editorial bandwidth to repurpose long-form content.',
      'You want more output without starting from a blank page every week.',
    ],
    heroAccent: 'podcast content',
    heroDescription:
      'We turn podcasts, webinars, interviews, and recorded conversations into clips, posts, articles, and publishing-ready assets.',
    heroTitle: 'We run your',
    includes: [
      'Source-material analysis',
      'Topic and clip extraction',
      'Multi-format repurposing',
      'Copywriting and packaging',
      'Publishing coordination',
      'Revision rounds',
      'Recurring editorial planning',
      'Content calendar management',
    ],
    intro:
      'Most teams do not need more ideas. They need a system that squeezes more value out of conversations they already had.',
    metaDescription:
      'Podcast-to-content service. Turn podcasts, webinars, and recorded conversations into clips, posts, and articles.',
    metaTitle: 'Podcast To Content Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Extract multiple high-signal content angles from one long-form recording.',
        icon: LuRadio,
        title: 'More Signal Per Recording',
      },
      {
        description:
          'Publish across channels without rebuilding the message from scratch every time.',
        icon: LuClapperboard,
        title: 'Multi-Channel Repurposing',
      },
      {
        description:
          'Build a content engine around material you are already producing anyway.',
        icon: LuCalendarRange,
        title: 'Compounding Output',
      },
    ],
    outcomesDescription:
      'If you are already creating conversations worth listening to, this service turns them into a much larger content surface area.',
    outcomesTitle: 'What This Solves',
    process: COMMON_SERVICE_PROCESS,
    processDescription:
      'The service model stays the same, but the source material starts with recordings instead of blank-page ideation.',
    processTitle: 'How It Works',
    slug: 'podcast-to-content',
    title: 'Podcast To Content Service',
  },
  {
    badge: 'Launch Content',
    closingDescription:
      'If you have a specific launch window and need fast coordinated output, book the call and we will scope the sprint.',
    closingTitle: 'Launch Content Without Last-Minute Chaos',
    deliverableBuckets: [
      {
        items: [
          'Launch narrative and message hierarchy',
          'Channel-by-channel content map',
          'Content calendar for the launch window',
          'Approval and publishing plan',
        ],
        title: 'Launch Planning',
      },
      {
        items: [
          'Announcement assets',
          'Promo clips and supporting visuals',
          'Social posts and email copy',
          'Follow-up content sequences',
        ],
        title: 'Launch Production',
      },
      {
        items: [
          'Execution support during launch',
          'Iteration on market response',
          'Post-launch follow-up content',
          'Retrospective and next-wave recommendations',
        ],
        title: 'Launch Operations',
      },
    ],
    deliverablesDescription:
      'A focused launch-content sprint for businesses that need coordinated output around a release, campaign, or go-to-market push.',
    deliverablesTitle: 'What The Sprint Covers',
    faqDescription: 'Structured for time-sensitive launch windows.',
    faqs: [
      {
        answer:
          'Product launches, new offers, campaign pushes, feature releases, partnership announcements, and timed go-to-market moments.',
        question: 'What kinds of launches fit this service?',
      },
      {
        answer:
          'No. This is a focused sprint model designed around a defined launch moment, though it can turn into a retainer if there is a longer-term fit.',
        question: 'Is this a retainer or a sprint?',
      },
      {
        answer:
          'Yes. The point is to centralize the launch-content workload so your internal team is not forced into last-minute production chaos.',
        question: 'Can this reduce launch stress for the internal team?',
      },
      {
        answer:
          'It depends on the timeline and scope, but the whole point is speed and coordination around a near-term launch window.',
        question: 'How quickly can we start?',
      },
      {
        answer:
          'Sprint pricing depends on launch intensity, deliverable count, channels, and turnaround speed.',
        question: 'How is launch pricing structured?',
      },
      {
        answer:
          'We review the launch date, core narrative, content requirements, stakeholders, and whether the sprint model is the right fit.',
        question: 'What happens on the call?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Best Fit',
    fitSignals: [
      'You have a real launch date or campaign window, not an abstract “sometime soon.”',
      'The internal team cannot absorb all launch-content execution without becoming the bottleneck.',
      'You need a concentrated burst of coordinated output, not a generic content retainer from day one.',
    ],
    heroAccent: 'launch content',
    heroDescription:
      'We plan and produce the launch-content layer around your release, campaign, or announcement so the team is not forced into reactive execution.',
    heroTitle: 'We run your',
    includes: [
      'Launch-message planning',
      'Content calendar for the launch window',
      'Multi-format launch assets',
      'Promo copy and support materials',
      'Publishing coordination',
      'Revision rounds',
      'Post-launch follow-up assets',
      'Execution support during the window',
    ],
    intro:
      'Launches usually fail at the content layer because nobody owns the coordination burden end-to-end. This service fixes that.',
    metaDescription:
      'Launch content service for campaigns, releases, and announcements. Plan and produce launch content without internal chaos.',
    metaTitle: 'Launch Content Service | Genfeed.ai',
    outcomes: [
      {
        description:
          'Move from vague launch ambition to a clear message-and-content system before the window opens.',
        icon: LuRocket,
        title: 'Clear Launch Narrative',
      },
      {
        description:
          'Produce the assets required to support the release across channels without scrambling at the last minute.',
        icon: LuMegaphone,
        title: 'Coordinated Execution',
      },
      {
        description:
          'Keep internal stakeholders focused on launch-critical work instead of becoming the content production team.',
        icon: LuBadgeCheck,
        title: 'Less Internal Drag',
      },
    ],
    outcomesDescription:
      'This is a sprint-shaped landing page for a sprint-shaped offer: concentrated execution around a defined launch moment.',
    outcomesTitle: 'What This Solves',
    process: COMMON_SERVICE_PROCESS,
    processDescription:
      'The same service framework, adapted for a high-tempo launch window instead of an open-ended retainer.',
    processTitle: 'How It Works',
    slug: 'launch-content',
    title: 'Launch Content Service',
  },
];

export const serviceLandingConfigBySlug = Object.fromEntries(
  serviceLandingConfigs.map((config) => [config.slug, config]),
) satisfies Record<string, ServiceLandingConfig>;

export const serviceLandingSlugs = serviceLandingConfigs.map(
  (config) => config.slug,
);
