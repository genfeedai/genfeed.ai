'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import PageLayout from '@web-components/PageLayout';
import { Check, Cookie, Eye, Lock, Mail, Shield } from 'lucide-react';
import Link from 'next/link';

const privacyPolicySections = [
  {
    content: [
      'We collect information you provide directly to us when creating a brand, using our services, or contacting our support team. This may include your name, email address, payment information, and content you generate using our platform.',
      'We also automatically collect certain information about your device and how you interact with our platform, including IP address, browser type, and usage statistics.',
    ],
    shortLabel: 'Collection',
    title: 'Information We Collect',
  },
  {
    listItems: [
      'To provide, maintain, and improve our services',
      'To process transactions and manage your account',
      'To send you technical notices, updates, and support messages',
      'To respond to your comments and questions',
      'To monitor and analyze trends and usage of our platform',
    ],
    shortLabel: 'Usage',
    title: 'How We Use Your Information',
  },
  {
    content: [
      'When you sign in with Google or connect a Google service, Genfeed receives only the data the features you use need: your name, email address, and profile photo for Google sign-in; your YouTube channel details, videos, comments, live chat, and channel analytics for YouTube; the Google Ads accounts and campaign data you authorize for Google Ads; and search performance data for the properties you authorize in Google Search Console.',
      'We use this data to show your content and analytics in Genfeed and to upload videos and post the comment and live chat replies you create or configure. OAuth tokens are encrypted at rest. We do not sell Google user data, use it for advertising, or use it to develop, improve, or train generalized AI or machine learning models. We call Google’s APIs only to run the features you use, and we never use your connection to collect or refresh data for our own purposes. Genfeed staff may access Google data already stored in our systems when you ask us for support, to operate and troubleshoot the service, to investigate a security issue or abuse, or when the law requires it.',
      "Genfeed's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      'YouTube features use YouTube API Services. By connecting YouTube you agree to the YouTube Terms of Service, and Google processes your data under the Google Privacy Policy.',
      'You can disconnect a Google service in Genfeed at any time or revoke Genfeed’s access from your Google Account permissions page. To delete data Genfeed stored from Google, contact privacy@genfeed.ai.',
    ],
    links: [
      {
        href: 'https://developers.google.com/terms/api-services-user-data-policy',
        label: 'Google API Services User Data Policy',
      },
      {
        href: 'https://www.youtube.com/t/terms',
        label: 'YouTube Terms of Service',
      },
      {
        href: 'https://policies.google.com/privacy',
        label: 'Google Privacy Policy',
      },
      {
        href: 'https://security.google.com/settings/security/permissions',
        label: 'Google Account permissions',
      },
    ],
    shortLabel: 'Google',
    title: 'Google and YouTube Data',
  },
];

const privacyRights = [
  {
    description:
      'You have the right to access personal data we hold about you and to request that we correct, update, or delete your information at any time.',
    icon: Eye,
    shortLabel: 'Access',
    title: 'Data Access',
  },
  {
    description:
      'Genfeed.ai is committed to protecting your data using industry-standard security measures. However, no method of transmission over the Internet is 100% secure.',
    icon: Lock,
    shortLabel: 'Security',
    title: 'Data Security',
  },
  {
    description:
      'We use cookies and similar technologies to enhance your experience, analyze usage, and assist in our marketing efforts. You can control cookies through your browser settings.',
    icon: Cookie,
    shortLabel: 'Cookies',
    title: 'Cookie Policy',
  },
];

export default function PrivacyContent() {
  const containerRef = useMarketingEntrance({ cards: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Legal"
        badgeIcon={Shield}
        compact
        title={<>Privacy Policy</>}
        description="How we protect your data. We don't sell your information."
      >
        {/* Main Privacy Sections */}
        <section className="py-32 gsap-hero">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-px bg-edge/5">
                {privacyPolicySections.map((section, index) => (
                  <div
                    key={section.title}
                    className="bg-background p-12 group hover:bg-fill/[0.02] transition-colors"
                  >
                    <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
                      {String(index + 1).padStart(2, '0')} /{' '}
                      {section.shortLabel}
                    </div>
                    <h2 className="text-2xl font-semibold mb-6">
                      {section.title}
                    </h2>

                    {section.content ? (
                      <div className="space-y-4">
                        {section.content.map((paragraph) => (
                          <p
                            key={`${section.shortLabel}-${paragraph}`}
                            className="text-surface/60 text-sm leading-relaxed"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : section.listItems ? (
                      <ul className="space-y-3">
                        {section.listItems.map((item) => (
                          <li key={item} className="flex items-start gap-3">
                            <Check className="size-4 text-surface/65 mt-0.5 shrink-0" />
                            <span className="text-surface/60 text-sm">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {section.links ? (
                      <ul className="mt-6 space-y-2">
                        {section.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-surface/80 text-sm underline underline-offset-4 hover:text-surface transition-colors"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Rights */}
        <section className="py-32 bg-fill/[0.02] gsap-section">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-semibold mb-6">
                Your Privacy Rights
              </h2>
              <p className="text-surface/65 max-w-xl mx-auto">
                We believe in transparency and your right to control your data.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 gap-px bg-edge/5 md:grid-cols-3">
                {privacyRights.map((right, index) => {
                  const Icon = right.icon;
                  return (
                    <div
                      key={right.title}
                      className="bg-background p-10 group hover:bg-fill/[0.02] transition-colors"
                    >
                      <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
                        {String(index + 1).padStart(2, '0')} /{' '}
                        {right.shortLabel}
                      </div>
                      <Icon className="size-8 text-surface/65 mb-4 group-hover:text-surface transition-colors" />
                      <h3 className="text-lg font-semibold mb-3">
                        {right.title}
                      </h3>
                      <p className="text-surface/65 text-sm leading-relaxed">
                        {right.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-40 gsap-section">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <Mail className="size-12 mx-auto text-surface/55 mb-8" />
              <h2 className="text-5xl font-semibold mb-10">Questions?</h2>
              <p className="text-surface/65 text-xl mb-12 font-medium">
                If you have any questions about our privacy practices, please
                contact our privacy team.
              </p>
              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
              >
                <Link href="mailto:privacy@genfeed.ai">
                  Contact Privacy Team
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
