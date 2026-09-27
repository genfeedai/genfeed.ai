import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import { Bot, Clapperboard, Cpu, Gauge, Repeat, Server } from 'lucide-react';

export const pitchLandingConfigs: ServiceLandingConfig[] = [
  // ── Done-For-You (lighter, smaller-ticket twin of the Retainer) ──────────────
  {
    badge: 'Done-For-You',
    closingDescription:
      'Book a call and we will scope a lighter engagement, or start free and run it yourself on Genfeed.',
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
      'A lighter done-for-you content service: we plan, produce, and publish a focused stream of content for you, without the full retainer commitment.',
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
          'Pricing is custom and sits below the full retainer. It scales with how many channels and how much output you need. We size it on the call.',
        question: 'How is it priced?',
      },
      {
        answer:
          'Scope. Done-For-You runs a focused stream of content on your core channels; the retainer is a full operation across more channels, higher volume, and deeper strategy.',
        question: 'How is this different from the retainer?',
      },
      {
        answer:
          'No. You stay at the direction and approval level. We handle production and publishing so content is off your plate.',
        question: 'Do I have to be involved every week?',
      },
      {
        answer:
          'Yes. When output outgrows this scope, it rolls straight into the full retainer: same team, no restart.',
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
      'A lighter done-for-you content service. We plan, produce, and publish for you, sized for smaller budgets and earlier-stage teams.',
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
      'Lighter done-for-you content service. We plan, produce, and publish a focused content stream for you, sized for smaller budgets. Custom scope.',
    metaTitle: 'Flexible Done-For-You Content | Genfeed.ai',
    outcomes: [
      {
        description:
          'Ship video, images, and posts on your core channels without hiring or managing freelancers.',
        icon: Clapperboard,
        title: 'Content, Handled',
      },
      {
        description:
          'A commitment sized to where you are now: real output without full-operation overhead.',
        icon: Gauge,
        title: 'Right-Sized Commitment',
      },
      {
        description:
          'Keep a consistent voice and cadence so your brand shows up week after week.',
        icon: Repeat,
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
          'Review what lands and adjust. Scale into the full retainer whenever you are ready.',
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
      'If you need owned models and AI influencers running at scale, book a call and we will design the fleet, or start free on Genfeed to try the workflow first.',
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
      'A managed model fleet: custom LoRAs, AI influencers, and dedicated inference, designed, trained, and run for you on our GPU estate.',
    deliverablesTitle: 'What The Fleet Delivers',
    faqDescription: 'For operators running owned models at scale.',
    faqs: [
      {
        answer:
          'Creators, agencies, and brands that want owned models and AI influencers: custom LoRAs, consistent characters, and dedicated generation, without operating GPU infrastructure themselves.',
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
      'Custom LoRAs, AI influencers, and dedicated inference, designed, trained, and operated for you on our GPU fleet.',
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
      'Generic models drift and credits meter every frame. A fleet is different: your own trained models, consistent identities, and dedicated capacity, built and run so you can produce at scale without touching infrastructure.',
    metaDescription:
      'Managed model fleet: custom LoRAs, AI influencers, and dedicated inference, trained and operated for you on GPU infrastructure. Custom scope.',
    metaTitle: 'Managed Model Fleet: Custom LoRAs | Genfeed.ai',
    outcomes: [
      {
        description:
          'Train models on your subjects, styles, and brand so identity stays consistent across every asset.',
        icon: Cpu,
        title: 'Owned Custom Models',
      },
      {
        description:
          'Create and run AI influencers with consistent faces, voices, and personas at production volume.',
        icon: Bot,
        title: 'AI Influencers At Scale',
      },
      {
        description:
          'Dedicated GPU capacity and a managed delivery pipeline: output at volume without running infrastructure.',
        icon: Server,
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
          'Operate and update the fleet over time: new models, refreshed styles, and scaling as you grow.',
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
