import { serviceOffering } from '@web-components/landing/service-offering.data';
import {
  agentLandingProcess,
  socialGrowthLandingConfigs,
} from '@web-components/landing/social-growth-landings.data';
import {
  BadgeCheck,
  CalendarRange,
  Clapperboard,
  FileText,
  Megaphone,
  Mic,
  Radio,
  Rocket,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

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
  /** Product acquisition pages connect an existing agent; service offers book calls. */
  isAgentFirst?: boolean;
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
  /**
   * Optional engagement label shown in the hero pill.
   */
  priceLabel?: string;
  /** Secondary price line under {@link priceLabel}. */
  priceNote?: string;
  /** Hero pill CTA hint. Defaults to "Book a call to scope it". */
  priceCtaHint?: string;
}

const COMMON_SERVICE_PROCESS = serviceOffering.process;
const COMMON_SERVICE_INCLUDES = serviceOffering.includes;

export const serviceLandingConfigs: ServiceLandingConfig[] = [
  {
    badge: 'Done-For-You',
    closingDescription:
      'Start free and run it yourself on Genfeed, or book a call and we will scope the engagement.',
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
    deliverablesDescription: serviceOffering.description,
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
          'Pricing is scoped on the call around content volume, channel mix, and review load, so the engagement is sized to what you actually need.',
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
      'Done-for-you content retainer for high-end SMBs. We handle strategy, production, and publishing so your brand ships consistently.',
    metaTitle: 'Done-For-You Content | Genfeed.ai',
    outcomes: [
      {
        description:
          'Turn founder insights, sales calls, customer questions, and product updates into a weekly publishing system.',
        icon: FileText,
        title: 'Strategy Into Output',
      },
      {
        description:
          'Ship short-form video, images, scripts, hooks, captions, and publishing-ready assets without building an in-house team.',
        icon: Clapperboard,
        title: 'Multi-Format Production',
      },
      {
        description:
          'Keep a consistent voice across channels while moving fast enough to support launches, campaigns, and ongoing demand.',
        icon: Mic,
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
    isAgentFirst: true,
    badge: 'Founder Content',
    closingDescription:
      'Connect your agent and turn what you shipped into your next post. Review the draft in Genfeed before it publishes.',
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
          'Draft refinement with your agent',
          'Audience-response loop',
          'Iteration on themes that resonate',
        ],
        title: 'Execution',
      },
    ],
    deliverablesDescription:
      'Give your connected agent the notes, customer insights, and product updates you already have. Genfeed supplies the brand context, content tools, scheduling, and analytics.',
    deliverablesTitle: 'What Your Agent Can Create',
    faqDescription: 'What solo founders ask before connecting.',
    faqs: [
      {
        answer:
          'Solo founders who already build with Codex, Claude, or another agent and want to turn what they ship into content without adding a content team.',
        question: 'Who is this for?',
      },
      {
        answer:
          'Yes. Connect your existing agent to Genfeed and authorize your workspace. Ask it to draft content from the product context you already work with.',
        question: 'Can I use the agent I already work with?',
      },
      {
        answer:
          'Add your past posts, notes, and brand voice to Genfeed. Your agent uses that context, and you review the result before publishing.',
        question: 'Will this still sound like me?',
      },
      {
        answer:
          'Product updates, customer insights, voice notes, rough bullet points, previous posts, and recorded conversations all work.',
        question: 'What should I give my agent?',
      },
      {
        answer:
          'You choose what goes out and when. Review the draft, connect your social account when ready, and approve the content before scheduling or publishing.',
        question: 'Does it publish without my approval?',
      },
      {
        answer:
          'Start for $0. Paid usage follows your Genfeed plan and credits. You can connect your agent and create a first draft without a sales call.',
        question: 'How does pricing work?',
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
      'Turn product updates, customer insights, and notes into content with the agent you already use. Genfeed keeps it on brand and ready for your review.',
    heroTitle: 'Your agent creates',
    includes: [
      'Founder voice positioning',
      'Topic extraction from source material',
      'LinkedIn-first content planning',
      'Video and text production',
      'Publishing coordination',
      'Draft review and refinement',
      'Feedback loop on audience response',
      'Monthly content planning',
    ],
    intro:
      'You already explain your product to your agent while you build. Connect it to Genfeed and ask it to turn that context into posts, visuals, or a launch thread. Keep building while the drafts land in your workspace for review.',
    metaDescription:
      'Founder content from your existing AI agent. Connect Codex, Claude, or another agent to Genfeed and turn product updates into drafts you approve.',
    metaTitle: 'Founder Content With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Extract strong content angles from calls, product updates, and rough founder notes.',
        icon: Sparkles,
        title: 'Capture The Signal',
      },
      {
        description:
          'Turn those inputs into posts, videos, hooks, and content systems that feel founder-led instead of generic.',
        icon: Users,
        title: 'Keep The Founder Voice',
      },
      {
        description:
          'Publish consistently enough to build demand without the founder manually pushing every piece across the line.',
        icon: CalendarRange,
        title: 'Remove The Bottleneck',
      },
    ],
    outcomesDescription:
      'For solo founders who want to build their product and their audience from the same agent workflow.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent to turn what you shipped into posts, visuals, or a launch thread in your voice.',
    ),
    processDescription:
      'Connect once, ask for a useful draft, review it, and publish on your terms.',
    processTitle: 'How It Works',
    slug: 'founder-content',
    title: 'Founder Content With Your Agent',
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
        icon: Radio,
        title: 'More Signal Per Recording',
      },
      {
        description:
          'Publish across channels without rebuilding the message from scratch every time.',
        icon: Clapperboard,
        title: 'Multi-Channel Repurposing',
      },
      {
        description:
          'Build a content engine around material you are already producing anyway.',
        icon: CalendarRange,
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
      'If you have a specific launch window, start free on Genfeed or book a call and we will scope the sprint.',
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
        icon: Rocket,
        title: 'Clear Launch Narrative',
      },
      {
        description:
          'Produce the assets required to support the release across channels without scrambling at the last minute.',
        icon: Megaphone,
        title: 'Coordinated Execution',
      },
      {
        description:
          'Keep internal stakeholders focused on launch-critical work instead of becoming the content production team.',
        icon: BadgeCheck,
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
  ...socialGrowthLandingConfigs,
];

export const serviceLandingConfigBySlug = Object.fromEntries(
  serviceLandingConfigs.map((config) => [config.slug, config]),
) satisfies Record<string, ServiceLandingConfig>;

export const serviceLandingSlugs = serviceLandingConfigs.map(
  (config) => config.slug,
);
