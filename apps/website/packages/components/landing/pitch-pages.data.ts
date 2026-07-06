import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import {
  LuBot,
  LuClapperboard,
  LuCpu,
  LuFileText,
  LuGauge,
  LuRepeat,
  LuServer,
} from 'react-icons/lu';

/**
 * High-ticket pitch pages — direct-send sales collateral, NOT the self-serve
 * funnel.
 *
 * These reuse the ServiceLandingPage renderer and the `(landing)` chrome, but
 * are deliberately kept out of the site nav and footer. They are reachable by
 * their URL and listed in the sitemap (indexable), so a link can be shared with
 * a lead and still rank — but the public funnel never routes to them.
 *
 * Pricing lives here on purpose: the public site keeps retainer/DFY pricing off
 * the page (see the vault "Offers And Pricing" note), while these pitch pages
 * carry the real numbers because they are sent to qualified buyers.
 */
export const pitchLandingConfigs: ServiceLandingConfig[] = [
  // ── Retainer ───────────────────────────────────────────────────────────────
  {
    badge: 'Retainer',
    closingDescription:
      'If content is a revenue channel but you do not want to build a team to run it, the next step is a call.',
    closingTitle: 'A Content Operation, Not Another Freelancer',
    deliverableBuckets: [
      {
        items: [
          'Monthly content strategy and themes',
          'Weekly production priorities',
          'Channel-level publishing plan',
          'Approval and review cadence',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Short-form video, images, and clips',
          'Scripts, hooks, captions, and articles',
          'Repurposing from your source material',
          'On-brand variations at volume',
        ],
        title: 'Production',
      },
      {
        items: [
          'Publishing coordination across channels',
          'Content calendar management',
          'Revision rounds',
          'Performance review and iteration',
        ],
        title: 'Operations',
      },
    ],
    deliverablesDescription:
      'A full content operation run on Genfeed — strategy, production, and publishing handled end to end so your brand ships consistently.',
    deliverablesTitle: 'What The Retainer Covers',
    faqDescription: 'Straight answers before the call.',
    faqs: [
      {
        answer:
          'Founder-led companies and high-end SMBs where content drives real revenue but building an internal content team is not the right move yet.',
        question: 'Who is this for?',
      },
      {
        answer:
          'A one-time $5,000 setup covers strategy, brand and voice calibration, workflow build, and the first production cycle. After that it is $2,000/month for ongoing execution. Scope scales with volume and channels.',
        question: 'How does pricing work?',
      },
      {
        answer:
          'No. You stay at the direction and approval level. The whole point is to remove content from your plate without adding meetings.',
        question: 'Do I have to be involved every week?',
      },
      {
        answer:
          'Everything runs on Genfeed, so you keep full visibility, own every asset, and can take the operation in-house or self-serve whenever you want.',
        question: 'What happens to the work if we stop?',
      },
      {
        answer:
          'Compared to an ~$8k/month content agency or a full-time hire, this is a smaller commitment that ships more, faster, because the production runs on our own platform.',
        question: 'How does this compare to an agency?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Engagement Fit',
    fitSignals: [
      'Content is a revenue channel, not a side project.',
      'You want an operator who turns rough ideas into shipped content.',
      'You are replacing fragmented freelancers or an inconsistent agency.',
    ],
    heroAccent: 'content operation',
    heroDescription:
      'A high-touch content retainer for founders and high-end SMBs — strategy, production, and publishing run for you on Genfeed.',
    heroTitle: 'We run your',
    includes: [
      'Content strategy and monthly planning',
      'Brand voice and messaging calibration',
      'Multi-format production',
      'Publishing coordination',
      'Revision rounds',
      'Performance review',
      'Shared approval workflow',
      'Dedicated operator',
    ],
    intro:
      'You bring the expertise, context, and final approvals. We handle strategy, production, and publishing so your brand shows up consistently — without another internal function to manage.',
    metaDescription:
      'High-touch content retainer for founders and high-end SMBs. $5,000 setup, then $2,000/month. Strategy, production, and publishing run for you on Genfeed.',
    metaTitle: 'Content Retainer | Genfeed.ai',
    outcomes: [
      {
        description:
          'Turn founder insight, product updates, and customer conversations into a reliable weekly publishing system.',
        icon: LuFileText,
        title: 'Strategy Into Output',
      },
      {
        description:
          'Ship video, images, scripts, and publishing-ready assets across channels without hiring.',
        icon: LuClapperboard,
        title: 'Multi-Format At Volume',
      },
      {
        description:
          'Keep one consistent voice while moving fast enough to support launches and ongoing demand.',
        icon: LuRepeat,
        title: 'Consistent Presence',
      },
    ],
    outcomesDescription:
      'For businesses that know content matters but do not want to run it internally.',
    outcomesTitle: 'What This Solves',
    priceCtaHint: 'Book a call to start',
    priceLabel: '$5,000 setup',
    priceNote: 'then $2,000 / month',
    process: [
      {
        description:
          'Discovery call to map goals, channels, audience, and the content already trapped in your calls and notes.',
        step: 'Scope',
      },
      {
        description:
          'One-time setup: brand voice, workflows, and calendar built on Genfeed, plus the first production cycle.',
        step: 'Build',
      },
      {
        description:
          'Monthly execution — production, publishing, and revisions on a clear operating rhythm.',
        step: 'Run',
      },
      {
        description:
          'Review what performed, then iterate themes and cadence against real engagement.',
        step: 'Iterate',
      },
    ],
    processDescription:
      'Clear operating rhythm. Minimal coordination overhead.',
    processTitle: 'How It Works',
    slug: 'retainer',
    title: 'Content Retainer',
  },

  // ── Done-For-You (lighter, smaller-ticket twin of the Retainer) ──────────────
  {
    badge: 'Done-For-You',
    closingDescription:
      'If you want content handled without stepping up to a full retainer, book a call and we will scope a lighter engagement.',
    closingTitle: 'Done-For-You, Right-Sized',
    deliverableBuckets: [
      {
        items: [
          'Focused monthly content themes',
          'Weekly priorities on your core channels',
          'Simple publishing plan',
          'Lightweight approvals',
        ],
        title: 'Planning',
      },
      {
        items: [
          'Short-form video, images, and clips',
          'Scripts, hooks, and captions',
          'Repurposing from your source material',
          'On-brand output at a steady cadence',
        ],
        title: 'Production',
      },
      {
        items: [
          'Publishing coordination',
          'Content calendar upkeep',
          'Revision rounds',
          'Light performance review',
        ],
        title: 'Publishing',
      },
    ],
    deliverablesDescription:
      'A lighter done-for-you content service: we plan, produce, and publish a focused stream of content for you — without the full retainer commitment.',
    deliverablesTitle: 'What You Get',
    faqDescription: 'Straight answers before the call.',
    faqs: [
      {
        answer:
          'Smaller teams and earlier-stage founders who want content handled but are not ready for a full content operation. It is the lighter, lower-commitment version of the retainer.',
        question: 'Who is this for?',
      },
      {
        answer:
          'Pricing is custom and sits below the full retainer — it scales with how many channels and how much output you need. We size it on the call.',
        question: 'How is it priced?',
      },
      {
        answer:
          'Scope. Done-For-You runs a focused stream of content on your core channels; the retainer is a full operation across more channels, higher volume, and deeper strategy.',
        question: 'How is this different from the retainer?',
      },
      {
        answer:
          'No. You stay at the direction and approval level — we handle production and publishing so content is off your plate.',
        question: 'Do I have to be involved every week?',
      },
      {
        answer:
          'Yes. When output outgrows this scope, it rolls straight into the full retainer — same team, no restart.',
        question: 'Can we scale up later?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Good Fit',
    fitSignals: [
      'You want content handled but not a full retainer yet.',
      'You have a smaller budget or a few core channels to cover.',
      'You want to see done-for-you content work before scaling it up.',
    ],
    heroAccent: 'content',
    heroDescription:
      'A lighter done-for-you content service — we plan, produce, and publish for you, sized for smaller budgets and earlier-stage teams.',
    heroTitle: 'We run your',
    includes: [
      'Content planning',
      'Brand voice calibration',
      'Multi-format production',
      'Publishing coordination',
      'Revision rounds',
      'Monthly calendar',
      'Hands-off execution',
      'Upgrade path to the retainer',
    ],
    intro:
      'Not every team needs a full content operation yet. Done-For-You is the lighter version: we handle a focused stream of content end to end, so you show up consistently without the retainer-level commitment.',
    metaDescription:
      'Lighter done-for-you content service. We plan, produce, and publish a focused content stream for you — sized for smaller budgets. Custom scope.',
    metaTitle: 'Done-For-You Content | Genfeed.ai',
    outcomes: [
      {
        description:
          'Ship video, images, and posts on your core channels without hiring or managing freelancers.',
        icon: LuClapperboard,
        title: 'Content, Handled',
      },
      {
        description:
          'A commitment sized to where you are now — real output without full-operation overhead.',
        icon: LuGauge,
        title: 'Right-Sized Commitment',
      },
      {
        description:
          'Keep a consistent voice and cadence so your brand shows up week after week.',
        icon: LuRepeat,
        title: 'Consistent Presence',
      },
    ],
    outcomesDescription:
      'For teams that want content done for them without stepping up to a full retainer.',
    outcomesTitle: 'What This Solves',
    priceCtaHint: 'Book a call to scope it',
    priceLabel: 'Custom',
    process: [
      {
        description:
          'Quick call to map your core channels, output goals, and the material we can work from.',
        step: 'Scope',
      },
      {
        description:
          'Produce a focused stream of on-brand content across your priority channels.',
        step: 'Produce',
      },
      {
        description:
          'Publish and coordinate on a steady cadence, with light revisions.',
        step: 'Publish',
      },
      {
        description:
          'Review what lands and adjust — scale into the full retainer whenever you are ready.',
        step: 'Iterate',
      },
    ],
    processDescription: 'A lighter operating rhythm, same hands-off execution.',
    processTitle: 'How It Works',
    slug: 'dfy',
    title: 'Done-For-You Content',
  },

  // ── Fleet ────────────────────────────────────────────────────────────────────
  {
    badge: 'Fleet',
    closingDescription:
      'If you need owned models and AI influencers running at scale, book a call and we will design the fleet.',
    closingTitle: 'Your Own Models. Your Own AI Influencers.',
    deliverableBuckets: [
      {
        items: [
          'Custom LoRA training on your subjects',
          'Character and identity consistency',
          'Style and brand fine-tuning',
          'Model versioning and updates',
        ],
        title: 'Models',
      },
      {
        items: [
          'AI influencer creation and personas',
          'Dedicated image and video generation',
          'Voice and avatar pipelines',
          'High-volume batch production',
        ],
        title: 'Production',
      },
      {
        items: [
          'Dedicated GPU inference capacity',
          'Delivery pipeline and scheduling',
          'Ongoing model and fleet operation',
          'Managed, hands-off runtime',
        ],
        title: 'Operation',
      },
    ],
    deliverablesDescription:
      'A managed model fleet: custom LoRAs, AI influencers, and dedicated inference — designed, trained, and run for you on our GPU estate.',
    deliverablesTitle: 'What The Fleet Delivers',
    faqDescription: 'For operators running owned models at scale.',
    faqs: [
      {
        answer:
          'Creators, agencies, and brands that want owned models and AI influencers — custom LoRAs, consistent characters, and dedicated generation — without operating GPU infrastructure themselves.',
        question: 'Who is this for?',
      },
      {
        answer:
          'Pricing is custom and depends on model count, training scope, inference volume, and how much of the operation we run. We scope it on the call.',
        question: 'How is it priced?',
      },
      {
        answer:
          'We train custom LoRAs for your subjects, styles, or brand, keep characters consistent, and run generation on dedicated capacity so quality and identity hold at volume.',
        question: 'What can the models do?',
      },
      {
        answer:
          'Both. We can build and run your own AI influencers end to end, or deliver a fleet your team directs while we handle training and infrastructure.',
        question: 'Do you run the influencers or do we?',
      },
      {
        answer:
          'It is fully managed. You get the output and the control; we handle training, inference capacity, and the delivery pipeline.',
        question: 'Do we need our own GPUs?',
      },
    ],
    faqTitle: 'Common Questions',
    fitLabel: 'Strong Fit',
    fitSignals: [
      'You need consistent characters or brand identity across large volumes.',
      'You want owned models, not per-generation tool credits.',
      'You are building AI influencers or a high-volume visual operation.',
    ],
    heroAccent: 'model fleet',
    heroDescription:
      'Custom LoRAs, AI influencers, and dedicated inference — designed, trained, and operated for you on our GPU fleet.',
    heroTitle: 'We run your',
    includes: [
      'Custom LoRA training',
      'Character and identity consistency',
      'AI influencer personas',
      'Dedicated image and video generation',
      'Voice and avatar pipelines',
      'Dedicated GPU capacity',
      'Delivery pipeline',
      'Managed operation',
    ],
    intro:
      'Generic models drift and credits meter every frame. A fleet is different: your own trained models, consistent identities, and dedicated capacity — built and run so you can produce at scale without touching infrastructure.',
    metaDescription:
      'Managed model fleet: custom LoRAs, AI influencers, and dedicated inference — trained and operated for you on GPU infrastructure. Custom scope.',
    metaTitle: 'Model Fleet | Genfeed.ai',
    outcomes: [
      {
        description:
          'Train models on your subjects, styles, and brand so identity stays consistent across every asset.',
        icon: LuCpu,
        title: 'Owned Custom Models',
      },
      {
        description:
          'Create and run AI influencers with consistent faces, voices, and personas at production volume.',
        icon: LuBot,
        title: 'AI Influencers At Scale',
      },
      {
        description:
          'Dedicated GPU capacity and a managed delivery pipeline — output at volume without running infrastructure.',
        icon: LuServer,
        title: 'Dedicated, Managed Inference',
      },
    ],
    outcomesDescription:
      'For operators who need owned models and consistent identities, not per-generation tool credits.',
    outcomesTitle: 'What This Solves',
    priceCtaHint: 'Book a call to design it',
    priceLabel: 'Custom',
    process: [
      {
        description:
          'Define the subjects, styles, characters, and output volume the fleet needs to deliver.',
        step: 'Design',
      },
      {
        description:
          'Train custom LoRAs and build the generation, voice, and avatar pipelines on dedicated capacity.',
        step: 'Train',
      },
      {
        description:
          'Produce at volume with consistent identity, scheduled and delivered through a managed pipeline.',
        step: 'Produce',
      },
      {
        description:
          'Operate and update the fleet over time — new models, refreshed styles, and scaling as you grow.',
        step: 'Operate',
      },
    ],
    processDescription: 'Owned models, run for you end to end.',
    processTitle: 'How It Works',
    slug: 'fleet',
    title: 'Model Fleet',
  },
];

export const pitchLandingConfigBySlug = Object.fromEntries(
  pitchLandingConfigs.map((config) => [config.slug, config]),
) satisfies Record<string, ServiceLandingConfig>;

export const pitchLandingSlugs = pitchLandingConfigs.map(
  (config) => config.slug,
);
