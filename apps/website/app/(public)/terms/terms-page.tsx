'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { Button } from '@ui/primitives/button';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import {
  LuCheck,
  LuFileText,
  LuGavel,
  LuMail,
  LuScale,
  LuShield,
} from 'react-icons/lu';

const termsOfService = [
  {
    content: [
      'By accessing or using Genfeed.ai, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our services.',
      'We reserve the right to modify these terms at any time. Your continued use of Genfeed.ai after any changes indicates your acceptance of the modified terms.',
    ],
    shortLabel: 'Acceptance',
    title: 'Acceptance of Terms',
  },
  {
    listItems: [
      'You must provide accurate and complete information when creating a brand',
      'You are responsible for maintaining the confidentiality of your account credentials',
      'You are solely responsible for all activities that occur under your account',
      'You must notify us immediately of any unauthorized use of your account',
      'We reserve the right to terminate accounts that violate our terms',
    ],
    shortLabel: 'Responsibilities',
    title: 'User Brands and Responsibilities',
  },
];

const legalInfo = [
  {
    content:
      'All content generated through our platform is subject to our intellectual property policies. Users retain rights to their created content as specified in our licensing terms.',
    icon: LuScale,
    shortLabel: 'IP',
    title: 'Intellectual Property',
  },
  {
    content:
      'All purchases are final. Credits are non-refundable but valid for 12 months from purchase date. If you experience technical issues preventing you from using the platform, contact support within 30 days for resolution.',
    icon: LuGavel,
    shortLabel: 'Refunds',
    title: 'Refund Policy',
  },
  {
    content:
      'Genfeed.ai is provided "as is" without warranties of any kind. We are not liable for any damages arising from the use of our services.',
    icon: LuShield,
    shortLabel: 'Liability',
    title: 'Limitation of Liability',
  },
  {
    content:
      'These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Genfeed.ai operates, without regard to conflict of law principles.',
    icon: LuFileText,
    shortLabel: 'Law',
    title: 'Governing Law',
  },
];

export default function TermsPage() {
  const containerRef = useMarketingEntrance({ cards: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Legal"
        badgeIcon={LuFileText}
        title={
          <>
            Terms of <span className="italic font-light">Service</span>
          </>
        }
        description="Legal terms for using Genfeed. All purchases final. No refunds."
      >
        {/* Main Terms */}
        <section className="py-32 gsap-hero">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-px bg-fill/5 border border-edge/5 overflow-hidden">
                {termsOfService.map((term, index) => (
                  <div
                    key={term.title}
                    className="bg-background p-12 group hover:bg-fill/[0.02] transition-colors"
                  >
                    <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                      {String(index + 1).padStart(2, '0')} / {term.shortLabel}
                    </div>
                    <h2 className="text-2xl font-bold mb-6">{term.title}</h2>

                    {term.content ? (
                      <div className="space-y-4">
                        {term.content.map((paragraph) => (
                          <p
                            key={`${term.shortLabel}-${paragraph}`}
                            className="text-surface/60 text-sm leading-relaxed"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : term.listItems ? (
                      <ul className="space-y-3">
                        {term.listItems.map((item) => (
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

        {/* Additional Legal Info */}
        <section className="py-32 bg-fill/[0.02] gsap-section">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-serif mb-6">
                Additional Legal Info
              </h2>
              <p className="text-surface/50 max-w-xl mx-auto">
                Important policies governing your use of Genfeed.
              </p>
            </div>

            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-fill/5 border border-edge/5 overflow-hidden">
                {legalInfo.map((info, index) => {
                  const Icon = info.icon;
                  return (
                    <div
                      key={info.title}
                      className="bg-background p-10 group hover:bg-fill/[0.02] transition-colors"
                    >
                      <div className="text-surface/20 text-xs font-black uppercase tracking-widest mb-6">
                        {String(index + 1).padStart(2, '0')} / {info.shortLabel}
                      </div>
                      <Icon className="h-8 w-8 text-surface/40 mb-4 group-hover:text-surface transition-colors" />
                      <h3 className="text-lg font-bold mb-3">{info.title}</h3>
                      <p className="text-surface/40 text-sm leading-relaxed">
                        {info.content}
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
                If you have any questions about these terms, please contact our
                support team.
              </p>
              <Button
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
              >
                <Link href="mailto:legal@genfeed.ai">Contact Support</Link>
              </Button>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
