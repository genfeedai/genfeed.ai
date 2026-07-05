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
 * Core FAQ items for home page and quick previews
 */
export const FAQ_ITEMS_CORE: FAQItem[] = [
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
    answer:
      'Sign up free and buy credits for the output you generate. Subscribe to Creator ($49/mo, 8,000 credits included) when you publish weekly, or Teams when you need seats, shared approvals, and multi-organization workflows.',
    question: 'How do I get started?',
  },
  {
    answer:
      'Genfeed tracks revenue, not just likes. Create ads in minutes, publish everywhere with one click, and see which posts actually drive sales. No other platform connects content performance to revenue.',
    question: 'How is this different from other content tools?',
  },
  {
    answer:
      'AI content generation just hit a critical threshold: quality now matches human output while production costs dropped 95%. This technology inflection point enables SMBs and agencies to create professional, on-brand content at scale without scaling headcount.',
    question: 'Why now? What changed?',
  },
];

/**
 * Full FAQ data organized by category (for /faq page)
 */
export const FAQ_CATEGORIES: Omit<FAQCategory, 'icon'>[] = [
  {
    category: 'General',
    questions: [
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
        answer:
          'Sign up free and buy credits for the output you generate. Subscribe to Creator ($49/mo, 8,000 credits included) when you publish weekly, or Teams when you need seats, shared approvals, and multi-organization workflows.',
        question: 'How do I get started?',
      },
    ],
  },
  {
    category: 'Pricing',
    questions: [
      {
        answer:
          'Credits buy output: 1 credit is one cent at the pay-as-you-go rate. Signing up is free, so you only pay for what you generate. Subscriptions include monthly credits at a ~40% better rate and unlock unlimited brands, more channels, and shared team seats.',
        question: 'How does pricing work?',
      },
      {
        answer:
          'Pay As You Go is free with credit packs. Creator is $49/month with 8,000 credits included. Teams is $499/month with unlimited seats and an 80,000-credit shared pool. Enterprise is custom.',
        question: 'What are the pricing tiers?',
      },
      {
        answer:
          'Yes. API access is included on every paid plan at the same credit price — generate in the studio or via code, drawing from the same credit balance. Creator gets standard rate limits, Teams higher limits, and Enterprise custom limits with an SLA.',
        question: 'Is there an API?',
      },
      {
        answer:
          'Yes. Signing up costs nothing and there is no monthly fee on Pay As You Go: you buy credits and spend them on output. Developers can also self-host the open-source core from GitHub.',
        question: 'Is there a free option?',
      },
      {
        answer:
          'An image is 50 credits ($0.50), an 8-second reel is 600 credits ($6.00), a voiceover is 17 credits per minute, and an article is 25 credits. Every job shows its price before you run it, and you can top up any amount from $10.',
        question: 'What does output cost?',
      },
      {
        answer:
          'Pay As You Go includes 1 brand kit and 3 connected channels. Creator raises that to unlimited brands and 15 channels. Teams and Enterprise remove the channel limits and add organizations, seats, and shared approvals.',
        question: 'How many brands and channels can I connect?',
      },
      {
        answer:
          'Teams is for agencies and teams that need shared workspaces, organization boundaries, brand systems, approvals, a shared credit pool, managed billing, and priority support.',
        question: 'When do I need Teams?',
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
        answer:
          'Pay As You Go includes a personal workspace, 1 brand kit, 3 connected channels, auto-routed premium models, and multi-platform publishing, with no monthly fee. Creator adds 8,000 monthly credits at a better rate, unlimited brand kits, and 15 channels.',
        question: "What's included in the free and Creator plans?",
      },
      {
        answer:
          'Teams adds unlimited seats, an 80,000-credit shared pool, collaboration workspaces, multi-organization accounts, unlimited brands, roles, shared approvals, managed billing, priority support, and advanced analytics.',
        question: 'What extra features come with Teams?',
      },
      {
        answer:
          'Enterprise includes custom output terms, unlimited organizations and brand kits, full API access, white-label deployment, SSO, dedicated Slack support, account management, and SLA terms.',
        question: 'What is included in Enterprise?',
      },
      {
        answer:
          'Managed API access depends on Creator, Teams, or Enterprise scope. Contact sales for production API terms.',
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
        answer:
          'Yes. Creator includes email support. Teams includes priority support. Enterprise includes a dedicated Slack channel and account manager.',
        question: 'Do you offer customer support?',
      },
    ],
  },
];
