import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import { Bot, Cpu, Server } from 'lucide-react';

export const pitchLandingConfigs: ServiceLandingConfig[] = [
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
