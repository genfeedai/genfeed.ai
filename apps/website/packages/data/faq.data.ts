import { PLAN_COPY } from '@helpers/business/pricing/pricing.helper';
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
    answer:
      'Genfeed is a content intelligence platform for serious creators. We help you discover trending topics, generate AI content (videos, images, voice, articles), distribute everywhere, track ROI, and optimize with AI insights, all in one platform.',
    question: 'What is Genfeed?',
  },
  {
    answer:
      'Genfeed is built for content creators, agencies, marketers, and founders who need to create and distribute content at scale while tracking actual business results (not just vanity metrics).',
    question: 'Who is Genfeed for?',
  },
  {
    answer: `Sign up free and buy credits for the output you generate. Subscribe to ${PLAN_COPY.pro.name} (${PLAN_COPY.pro.priceLabel}, ${PLAN_COPY.pro.includedCredits} included) when you publish weekly, or ${PLAN_COPY.scale.name} when you need seats, shared approvals, and multi-organization workflows.`,
    question: 'How do I get started?',
  },
];

/**
 * Core FAQ items for home page and quick previews
 */
export const FAQ_ITEMS_CORE: FAQItem[] = [
  ...FAQ_ITEMS_GENERAL,
  {
    answer:
      'Genfeed tracks revenue, not just likes. Create ads in minutes, publish everywhere with one click, and see which posts actually drive sales. No other platform connects content performance to revenue.',
    question: 'How is this different from other content tools?',
  },
  {
    answer:
      'AI generation has reached the point where a small team can produce professional, on-brand content at a fraction of the old cost and effort. Genfeed puts that capability in one workspace, so creators, marketers, and agencies can scale output without scaling headcount.',
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
        answer:
          'Credits buy output: 1 credit is one cent at the pay-as-you-go rate. Signing up is free, so you only pay for what you generate. Subscriptions include monthly credits at a ~40% better rate, paid API access, and shared team seats.',
        question: 'How does pricing work?',
      },
      {
        answer: `${PLAN_COPY.payg.name} is free with credit packs. ${PLAN_COPY.pro.name} is ${PLAN_COPY.pro.monthlyPrice} with ${PLAN_COPY.pro.includedCredits} included. ${PLAN_COPY.scale.name} is ${PLAN_COPY.scale.monthlyPrice} with unlimited seats and a shared pool of ${PLAN_COPY.scale.includedCredits}. ${PLAN_COPY.enterprise.name} is custom.`,
        question: 'What are the pricing tiers?',
      },
      {
        answer: `Yes. API access is included on every paid plan at the same credit price. Generate in the studio or via code, drawing from the same credit balance. ${PLAN_COPY.pro.name} gets standard rate limits, ${PLAN_COPY.scale.name} higher limits, and ${PLAN_COPY.enterprise.name} custom limits with an SLA.`,
        question: 'Is there an API?',
      },
      {
        answer: `Yes. Signing up costs nothing and there is no monthly fee on ${PLAN_COPY.payg.name}: you buy credits and spend them on output.`,
        question: 'Is there a free option?',
      },
      {
        answer:
          'An image is 50 credits ($0.50), an 8-second reel is 600 credits ($6.00), a voiceover is 17 credits per minute, and an article is 25 credits. Every job shows its price before you run it, and you can top up any amount from $10.',
        question: 'What does output cost?',
      },
      {
        answer: `Brands and connected channels are unlimited. ${PLAN_COPY.payg.name} and ${PLAN_COPY.pro.name} include one organization; ${PLAN_COPY.scale.name} and ${PLAN_COPY.enterprise.name} add multi-organization workflows, seats, shared approvals, and higher API limits.`,
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
          'You never pick a model. The Genfeed router sends every job to the best premium model for the format, brief, and budget, and it upgrades automatically as better models ship. You see the output and its credit price, not a model menu.',
        question: 'Which AI models do you use?',
      },
      {
        answer:
          'Most content generates in 1-5 minutes. Videos: 2-5 minutes. Images: 10-30 seconds. Voice: 30 seconds. Articles: 1-2 minutes. Generation times may vary based on platform load.',
        question: 'How long does it take to generate content?',
      },
      {
        answer:
          'Yes, all generated content can be edited, downloaded, and customized before publishing. You have full control over your content.',
        question: 'Can I edit generated content?',
      },
      {
        answer:
          'Genfeed supports multi-platform publishing to YouTube, TikTok, Instagram, X (Twitter), LinkedIn, and more. You can schedule and automate posts across all platforms.',
        question: 'What platforms can I publish to?',
      },
    ],
  },
  {
    category: 'Features & Access',
    questions: [
      {
        answer: `${PLAN_COPY.payg.name} includes one personal organization, unlimited brand kits, unlimited connected channels, auto-routed premium models, and multi-platform publishing, with no monthly fee. ${PLAN_COPY.pro.name} adds ${PLAN_COPY.pro.includedCredits} monthly at a better rate and paid API access.`,
        question: `What's included in the free and ${PLAN_COPY.pro.name} plans?`,
      },
      {
        answer: `${PLAN_COPY.scale.name} adds unlimited seats, a shared pool of ${PLAN_COPY.scale.includedCredits}, collaboration workspaces, multi-organization accounts, unlimited brands, roles, shared approvals, managed billing, priority support, and advanced analytics.`,
        question: `What extra features come with ${PLAN_COPY.scale.name}?`,
      },
      {
        answer: `${PLAN_COPY.enterprise.name} includes custom output terms, unlimited organizations and brand kits, full API access, white-label deployment, SSO, dedicated Slack support, account management, and SLA terms.`,
        question: `What is included in ${PLAN_COPY.enterprise.name}?`,
      },
      {
        answer: `Managed API access depends on ${PLAN_COPY.pro.name}, ${PLAN_COPY.scale.name}, or ${PLAN_COPY.enterprise.name} scope. Contact sales for production API terms.`,
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
          'Yes. All content is stored securely with encryption. You own 100% of the rights to content you generate. We never use your content for training or share it with third parties.',
        question: 'Is my content secure?',
      },
      {
        answer:
          'Yes, you can delete your account and all associated data at any time. Note that unused credits are non-refundable upon account deletion.',
        question: 'Can I delete my account and data?',
      },
      {
        answer: `Yes. ${PLAN_COPY.pro.name} includes email support. ${PLAN_COPY.scale.name} includes priority support. ${PLAN_COPY.enterprise.name} includes a dedicated Slack channel and account manager.`,
        question: 'Do you offer customer support?',
      },
    ],
  },
];
