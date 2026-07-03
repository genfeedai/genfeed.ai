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
      'Genfeed is a content intelligence platform for serious creators. We help you discover trending topics, generate AI content (videos, images, voice, articles), distribute everywhere, track ROI, and optimize with AI insights—all in one platform.',
    question: 'What is Genfeed?',
  },
  {
    answer:
      'Genfeed is built for content creators, agencies, marketers, and founders who need to create and distribute content at scale while tracking actual business results (not just vanity metrics).',
    question: 'Who is Genfeed for?',
  },
  {
    answer:
      'Start with the Cloud App for $49/mo plus pay-as-you-go output. Move to Cloud Teams when you need paid seats, shared approvals, multi-organization workflows, and managed billing.',
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
          'Genfeed is a content intelligence platform for serious creators. We help you discover trending topics, generate AI content (videos, images, voice, articles), distribute everywhere, track ROI, and optimize with AI insights—all in one platform.',
        question: 'What is Genfeed?',
      },
      {
        answer:
          'Genfeed is built for content creators, agencies, marketers, and founders who need to create and distribute content at scale while tracking actual business results (not just vanity metrics).',
        question: 'Who is Genfeed for?',
      },
      {
        answer:
          'Start with the Cloud App for $49/mo plus pay-as-you-go output. Move to Cloud Teams when you need paid seats, shared approvals, multi-organization workflows, and managed billing.',
        question: 'How do I get started?',
      },
    ],
  },
  {
    category: 'Pricing',
    questions: [
      {
        answer:
          'Genfeed separates platform access from output usage. Cloud App starts at $49/mo plus pay-as-you-go output. Cloud Teams adds paid seats, collaboration, multi-organization workflows, and managed billing. Enterprise is custom.',
        question: 'How does pricing work?',
      },
      {
        answer:
          'Cloud App is $49/month plus pay-as-you-go output. Cloud Teams starts at $499/month for collaboration, multi-organization, and multi-brand use cases. Enterprise is custom.',
        question: 'What are the pricing tiers?',
      },
      {
        answer:
          'No. The managed product starts with Cloud App at $49/mo plus usage-based output. The entry plan is priced around real production output instead of an artificial free tier.',
        question: 'Is there a free option?',
      },
      {
        answer:
          'The entry Cloud App plan does not bundle output quotas. You pay for the videos, images, and voice output you create.',
        question: 'What happens when I create more?',
      },
      {
        answer:
          'Cloud Teams is for agencies and teams that need shared workspaces, organization boundaries, brand systems, approvals, managed billing, and priority support.',
        question: 'When do I need Cloud?',
      },
    ],
  },
  {
    category: 'Content Creation',
    questions: [
      {
        answer:
          'We use premium AI models including Veo-3 and Kling for videos, Flux-pro and Imagen for images, ElevenLabs for voice, Hedra for avatars, and GPT-4 for articles. All models are included in your credit purchase.',
        question: 'What AI models do you use?',
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
          'Cloud App includes managed platform access, a personal workspace, one brand kit, premium AI models, multi-platform publishing, and pay-as-you-go output.',
        question: "What's included in Cloud App?",
      },
      {
        answer:
          'Cloud Teams adds collaboration workspaces, multi-organization accounts, multi-brand operations, roles, shared approvals, managed billing, priority support, and advanced analytics.',
        question: 'What extra features come with Cloud Teams?',
      },
      {
        answer:
          'Enterprise includes custom output terms, unlimited organizations and brand kits, full API access, white-label deployment, SSO, dedicated Slack support, account management, and SLA terms.',
        question: 'What is included in Enterprise?',
      },
      {
        answer:
          'Managed API access depends on Cloud App, Cloud Teams, or Enterprise scope. Contact sales for production API terms.',
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
          'Yes. Cloud App includes email support. Cloud Teams includes priority support. Enterprise includes a dedicated Slack channel and account manager.',
        question: 'Do you offer customer support?',
      },
    ],
  },
];
