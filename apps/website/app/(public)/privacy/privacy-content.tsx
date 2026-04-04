'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import {
  LuCheck,
  LuCookie,
  LuEye,
  LuLock,
  LuMail,
  LuShield,
} from 'react-icons/lu';

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
];

const privacyRights = [
  {
    description:
      'You have the right to access personal data we hold about you and to request that we correct, update, or delete your information at any time.',
    icon: LuEye,
    shortLabel: 'Access',
    title: 'Data Access',
  },
  {
    description:
      'Genfeed.ai is committed to protecting your data using industry-standard security measures. However, no method of transmission over the Internet is 100% secure.',
    icon: LuLock,
    shortLabel: 'Security',
    title: 'Data Security',
  },
  {
    description:
      'We use cookies and similar technologies to enhance your experience, analyze usage, and assist in our marketing efforts. You can control cookies through your browser settings.',
    icon: LuCookie,
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
        badgeIcon={LuShield}
        title={
          <>
            Privacy <span className="italic font-light">Policy</span>
          </>
        }
        description="How we protect your data. We don't sell your information."
      >
        {/* Main Privacy Sections */}
        <section className="py-32 gsap-hero">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-px bg-fill/5 border border-edge/5 overflow-hidden">
                {privacyPolicySections.map((section, index) => (
                  <div
                    key={section.title}
                    className="bg-background p-12 group hover:bg-fill/[0.02] transition-colors"
                  >
                    <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                      {String(index + 1).padStart(2, '0')} /{' '}
                      {section.shortLabel}
                    </div>
                    <h2 className="text-2xl font-bold mb-6">{section.title}</h2>

                    {section.content ? (
                      <div className="space-y-4">
                        {section.content.map((paragraph, index) => (
                          <p
                            key={index}
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
                            <LuCheck className="h-4 w-4 text-surface/40 mt-0.5 shrink-0" />
                            <span className="text-surface/60 text-sm">
                              {item}
                            </span>
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
              <h2 className="text-5xl font-serif mb-6">Your Privacy Rights</h2>
              <p className="text-surface/50 max-w-xl mx-auto">
                We believe in transparency and your right to control your data.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-fill/5 border border-edge/5 overflow-hidden">
                {privacyRights.map((right, index) => {
                  const Icon = right.icon;
                  return (
                    <div
                      key={right.title}
                      className="bg-background p-10 group hover:bg-fill/[0.02] transition-colors"
                    >
                      <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                        {String(index + 1).padStart(2, '0')} /{' '}
                        {right.shortLabel}
                      </div>
                      <Icon className="h-8 w-8 text-surface/40 mb-4 group-hover:text-surface transition-colors" />
                      <h3 className="text-lg font-bold mb-3">{right.title}</h3>
                      <p className="text-surface/40 text-sm leading-relaxed">
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
              <LuMail className="h-12 w-12 mx-auto text-surface/30 mb-8" />
              <h2 className="text-5xl font-serif mb-10">Questions?</h2>
              <p className="text-surface/40 text-xl mb-12 font-medium">
                If you have any questions about our privacy practices, please
                contact our privacy team.
              </p>
              <Button
                asChild
                variant={ButtonVariant.OUTLINE}
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
