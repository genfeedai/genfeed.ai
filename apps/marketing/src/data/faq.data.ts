import { agentClients } from '@data/agent-clients.data';
import {
  FREE_API_RATE_LIMIT,
  IMAGE_CREDIT_COSTS,
  PLAN_COPY,
} from '@genfeedai/pricing';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { ReactNode } from 'react';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQCategory {
  category: string;
  icon?: ReactNode;
  questions: FAQItem[];
}

/**
 * Shared by the home-page preview and the General category on /faq, so the two
 * surfaces can never answer the same question differently.
 */
const FAQ_ITEMS_GENERAL: FAQItem[] = [
  {
    answer: metadata.description,
    question: 'What is Genfeed?',
  },
  {
    answer:
      'No. Genfeed makes and manages everything you publish: short-form video, images, ads, posts and threads, articles, newsletters, presenter video and voice. It also covers what comes before and after the file: trends, scheduling, publishing and analytics.',
    question: 'Is Genfeed only for video?',
  },
  {
    answer: `Genfeed has MCP setup guides for ${agentClients.map((client) => client.name).join(', ')}. Each agent has its own setup page on this site, and the dashboard shows what your agent made.`,
    question: 'Which agents work with Genfeed?',
  },
  {
    answer:
      'Yes. Any agent connected over MCP, Claude included, can generate images, video and audio with your brand context.',
    question: 'Can my agent create images and video?',
  },
  {
    answer:
      'Genfeed is built for creators, agencies, marketers and founders who make and publish content across several channels and want the results in one place.',
    question: 'Who is Genfeed for?',
  },
  {
    answer: `Connect the agent you already use, or sign up in the dashboard and try it on your brand. Publishing starts with your first payment: credits for the output you generate, or a plan. Subscribe to ${PLAN_COPY.pro.name} (${PLAN_COPY.pro.priceLabel}, ${PLAN_COPY.pro.includedCredits} included) for every app in one workspace, or ${PLAN_COPY.scale.name} (${PLAN_COPY.scale.priceLabel}, ${PLAN_COPY.scale.includedCredits} included) when you run content for multiple clients and need seats, shared approvals, and multi-organization workflows.`,
    question: 'How do I get started?',
  },
];

/** The homepage preview: scope first, then the agent questions, then the way in. */
export const FAQ_ITEMS_HOME: FAQItem[] = FAQ_ITEMS_GENERAL.filter(
  (item) => item.question !== 'Who is Genfeed for?',
);

/**
 * Core FAQ items for home page and quick previews
 */
export const FAQ_ITEMS_CORE: FAQItem[] = [
  ...FAQ_ITEMS_GENERAL,
  {
    answer:
      'Most tools start when the content already exists. Genfeed covers the full loop: trends, remix, publish and analytics, with your brand context throughout. You run it from the agent you already use, and the dashboard is where you review, publish and see what worked.',
    question: 'How is this different from other content tools?',
  },
  {
    answer:
      'AI generation is now good enough for a small team to make on-brand video, images and posts without a studio. Genfeed puts that in one agent, so creators, marketers and agencies publish more without hiring more.',
    question: 'Why now? What changed?',
  },
];

/**
 * Full FAQ data organized by category (for /faq page)
 */
export const FAQ_CATEGORIES: Omit<FAQCategory, 'icon'>[] = [
  {
    category: 'General',
    questions: FAQ_ITEMS_GENERAL,
  },
  {
    category: 'Pricing',
    questions: [
      {
        answer: `Credits buy output: 1 credit is one cent at the pay-as-you-go rate. You try Genfeed on your brand during onboarding, and publishing starts with your first payment. Subscriptions include monthly credits at a ${PLAN_COPY.scale.creditRateAdvantage} better rate, higher API limits, and shared team seats.`,
        question: 'How does pricing work?',
      },
      {
        answer: `${PLAN_COPY.payg.name} has no subscription: credit packs from $10. ${PLAN_COPY.pro.name} is ${PLAN_COPY.pro.monthlyPrice} with every app and ${PLAN_COPY.pro.includedCredits} a month. ${PLAN_COPY.scale.name} is ${PLAN_COPY.scale.monthlyPrice} with unlimited seats and a shared pool of ${PLAN_COPY.scale.includedCredits}. ${PLAN_COPY.enterprise.name} is custom.`,
        question: 'What are the pricing tiers?',
      },
      {
        answer: `Yes. API access is included on every plan at the same credit price. Generate from your agent, in the app or via code, drawing from the same credit balance. ${PLAN_COPY.payg.name} allows ${FREE_API_RATE_LIMIT} requests per minute, ${PLAN_COPY.pro.name} and ${PLAN_COPY.scale.name} get higher rate limits, and ${PLAN_COPY.enterprise.name} custom limits.`,
        question: 'Is there an API?',
      },
      {
        answer: `Not on Genfeed Cloud. You try it on your brand during onboarding, and publishing starts with your first payment: a plan, or ${PLAN_COPY.payg.name} credits from $10 with no monthly fee. The free route is self-hosting the open-source core.`,
        question: 'Is there a free option?',
      },
      {
        answer: `A FLUX.3 image is ${IMAGE_CREDIT_COSTS.image1kTo2k.minCredits} to ${IMAGE_CREDIT_COSTS.image1kTo2k.maxCredits} credits at 1K to 2K, an 8-second reel is 600 credits ($6.00), a voiceover is 17 credits per minute, and an article is 25 credits. Other models are priced per model. Every job shows its price before you run it, and you can top up any amount from $10.`,
        question: 'What does output cost?',
      },
      {
        answer: `Brands and connected channels are unlimited. ${PLAN_COPY.payg.name} includes one organization; ${PLAN_COPY.scale.name} and ${PLAN_COPY.enterprise.name} add multi-organization workflows, seats, shared approvals, and higher API limits.`,
        question: 'How many brands and channels can I connect?',
      },
      {
        answer: `${PLAN_COPY.scale.name} is for agencies and teams that need shared workspaces, organization boundaries, brand systems, approvals, a shared credit pool, managed billing, and priority support.`,
        question: `When do I need ${PLAN_COPY.scale.name}?`,
      },
    ],
  },
  {
    category: 'Content Creation',
    questions: [
      {
        answer:
          'Genfeed supports image, video, text, voice and music models from multiple providers. Available models depend on the format, deployment and configured providers. You can choose a model in the app, let your agent pick one, or use automatic routing where supported.',
        question: 'Which AI models do you use?',
      },
      {
        answer:
          'Generation time depends on the model, output length and provider queue. Genfeed shows job progress so you can return to the result when it is ready.',
        question: 'How long does it take to generate content?',
      },
      {
        answer:
          'Yes, all generated content can be edited, downloaded, and customized before publishing. You have full control over your content.',
        question: 'Can I edit generated content?',
      },
      {
        answer:
          'Genfeed supports multi-platform publishing to YouTube, TikTok, Instagram, X (Twitter), LinkedIn, and more. Connect your accounts in Genfeed, then review and schedule posts for supported channels.',
        question: 'What platforms can I publish to?',
      },
    ],
  },
  {
    category: 'Features & Access',
    questions: [
      {
        answer: `${PLAN_COPY.payg.name} includes one personal organization, unlimited brand kits, unlimited connected channels, auto-routed premium models, and multi-platform publishing, with no monthly fee. ${PLAN_COPY.scale.name} adds ${PLAN_COPY.scale.includedCredits} monthly at a better rate and higher API limits.`,
        question: `What's included in the ${PLAN_COPY.payg.name} plan?`,
      },
      {
        answer: `${PLAN_COPY.scale.name} adds unlimited seats, a shared pool of ${PLAN_COPY.scale.includedCredits}, collaboration workspaces, multi-organization accounts, unlimited brands, roles, shared approvals, managed billing, priority support, and advanced analytics.`,
        question: `What extra features come with ${PLAN_COPY.scale.name}?`,
      },
      {
        answer: `${PLAN_COPY.enterprise.name} includes custom output terms, unlimited organizations and brand kits, full API access with custom rate limits, dedicated Slack support, and an account manager.`,
        question: `What is included in ${PLAN_COPY.enterprise.name}?`,
      },
      {
        answer: `API access is included on every plan: ${PLAN_COPY.payg.name} allows ${FREE_API_RATE_LIMIT} requests per minute. ${PLAN_COPY.pro.name}, ${PLAN_COPY.scale.name} and ${PLAN_COPY.enterprise.name} get higher limits. Contact sales for production API terms.`,
        question: 'Do you have an API?',
      },
    ],
  },
  {
    category: 'Technical',
    questions: [
      {
        answer:
          'Videos: MP4, MOV. Images: PNG, JPG, WebP. Voice: MP3, WAV. Articles: Markdown, HTML, plain text. All exports are optimized for social media platforms.',
        question: 'What file formats do you support?',
      },
      {
        answer:
          'Your workspace controls access to your content. Cloud generation sends the inputs needed for the job to the selected model provider. Content rights and data handling depend on the provider and your deployment; review our Privacy Policy and Terms for details.',
        question: 'Is my content secure?',
      },
      {
        answer:
          'Yes, you can delete your account and all associated data at any time. Note that unused credits are non-refundable upon account deletion.',
        question: 'Can I delete my account and data?',
      },
      {
        answer: `Yes. ${PLAN_COPY.scale.name} includes priority support. ${PLAN_COPY.enterprise.name} includes a dedicated Slack channel and account manager.`,
        question: 'Do you offer customer support?',
      },
    ],
  },
];
