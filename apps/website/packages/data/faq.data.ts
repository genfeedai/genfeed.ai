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
      'Sign up at genfeed.ai and start creating in minutes. Plans start at $499/mo.',
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
          'Sign up at genfeed.ai and start creating in minutes. Plans start at $499/mo.',
        question: 'How do I get started?',
      },
    ],
  },
  {
    category: 'Pricing',
    questions: [
      {
        answer:
          'Genfeed uses output-based pricing. You pay for what you create: videos, images, and voice minutes. No confusing credits—just simple quotas that reset monthly.',
        question: 'How does pricing work?',
      },
      {
        answer:
          'Pro: $499/month (30 videos + 500 images + 60 min voice). Scale: $1,499/month (100 videos + 2,000 images + 200 min voice). Enterprise: $4,999/month (unlimited everything).',
        question: 'What are the pricing tiers?',
      },
      {
        answer:
          'Self-host on your own infrastructure for free. Cloud plans start at $499/mo.',
        question: 'Is there a free option?',
      },
      {
        answer:
          'When you hit your monthly quota, generation stops until your quota resets next month. You can upgrade to a higher tier anytime for more capacity.',
        question: 'What happens when I reach my limit?',
      },
      {
        answer:
          'Your quotas reset on your billing date each month. Unused quotas do not roll over—use it or lose it.',
        question: 'Do unused quotas roll over?',
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
          'Pro ($499/month) includes: 30 AI videos, 500 images, 60 min voice per month. Plus 2 team seats, 1 brand kit, premium AI models (auto-selected for best quality), multi-platform publishing, and email support.',
        question: "What's included in the Pro tier?",
      },
      {
        answer:
          'Scale ($1,499/month) includes: 100 AI videos, 2,000 images, 200 min voice per month. Plus 10 team seats, 5 brand kits, model selection unlocked, read-only API access, priority support, advanced analytics, and custom domains.',
        question: 'What extra features come with Scale?',
      },
      {
        answer:
          'Enterprise ($4,999/month) includes unlimited everything: videos, images, voice, team seats, brand kits. Plus full API access, white-label deployment (custom domain + branding), SSO, dedicated Slack support, and 99.9% SLA.',
        question: 'What is included in Enterprise?',
      },
      {
        answer:
          'Read-only API access is included with Scale tier. Full read/write API access is available for Enterprise customers. Contact sales for API documentation.',
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
          'Yes. Pro tier includes email support (48hr response). Scale includes priority support (24hr response). Enterprise includes dedicated Slack channel and account manager.',
        question: 'Do you offer customer support?',
      },
    ],
  },
];
