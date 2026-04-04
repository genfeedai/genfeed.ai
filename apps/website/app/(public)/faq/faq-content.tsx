'use client';

import { FAQ_CATEGORIES, type FAQCategory } from '@data/faq.data';
import { ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import ButtonRequestAccess from '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess';
import PageLayout from '@web-components/PageLayout';
import type { ReactNode } from 'react';
import {
  HiOutlineBookOpen,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCog6Tooth,
  HiOutlineCreditCard,
  HiOutlineCubeTransparent,
  HiOutlineEnvelope,
  HiOutlineSparkles,
} from 'react-icons/hi2';

// Map category names to icons
const CATEGORY_ICONS: Record<string, ReactNode> = {
  'Content Creation': <HiOutlineSparkles className="w-5 h-5" />,
  'Features & Access': <HiOutlineCubeTransparent className="w-5 h-5" />,
  General: <HiOutlineBookOpen className="w-5 h-5" />,
  Pricing: <HiOutlineCreditCard className="w-5 h-5" />,
  Technical: <HiOutlineCog6Tooth className="w-5 h-5" />,
};

// Combine shared data with icons
const faqs: FAQCategory[] = FAQ_CATEGORIES.map((category) => ({
  ...category,
  icon: CATEGORY_ICONS[category.category],
}));

function scrollToCategory(categoryId: string) {
  const element = document.getElementById(categoryId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function FAQContent() {
  const containerRef = useMarketingEntrance({ sections: false });

  return (
    <div ref={containerRef}>
      <PageLayout
        title="FAQ"
        description="Pricing, features, and how to get access to Genfeed"
      >
        {/* Two-column layout */}
        <section className="max-w-4xl mx-auto pb-8">
          <div className="gsap-grid grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
            {/* Left column - FAQ content */}
            <div className="space-y-12">
              <div className="gsap-hero">
                <h1 className="text-4xl font-bold mb-4">
                  Frequently Asked Questions
                </h1>
                <p className="text-lg text-muted-foreground">
                  Everything you need to know about Genfeed
                </p>
              </div>

              {faqs.map((category) => (
                <div
                  key={category.category}
                  id={category.category.toLowerCase().replace(/\s+/g, '-')}
                  className="gsap-card"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-primary/10 text-primary">
                      {category.icon}
                    </div>
                    <h2 className="text-2xl font-bold">{category.category}</h2>
                  </div>

                  <Accordion type="single" collapsible className="space-y-3">
                    {category.questions.map((item) => (
                      <AccordionItem
                        key={item.question}
                        value={item.question}
                        className="bg-fill/5 border border-edge/10 px-2 data-[state=open]:bg-fill/[0.07]"
                      >
                        <AccordionTrigger className="px-4 py-4 text-base font-medium hover:no-underline text-left">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 text-muted-foreground leading-relaxed">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
            </div>

            {/* Right column - Sticky sidebar */}
            <div className="hidden lg:block">
              <div className="sticky top-24 space-y-6">
                {/* Category navigation */}
                <div className="bg-fill/5 border border-edge/10 p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Jump to
                  </h3>
                  <nav className="space-y-1">
                    {faqs.map((category) => (
                      <Button
                        key={category.category}
                        type="button"
                        variant={ButtonVariant.UNSTYLED}
                        onClick={() =>
                          scrollToCategory(
                            category.category
                              .toLowerCase()
                              .replace(/\s+/g, '-'),
                          )
                        }
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-surface hover:bg-fill/10 transition-colors"
                      >
                        {category.icon}
                        <span>{category.category}</span>
                        <span className="ml-auto text-xs opacity-50">
                          {category.questions.length}
                        </span>
                      </Button>
                    ))}
                  </nav>
                </div>

                {/* Contact card */}
                <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-primary/20 text-primary">
                      <HiOutlineChatBubbleLeftRight className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold">Still have questions?</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    Sign up and we&apos;ll answer everything during onboarding.
                  </p>
                  <ButtonRequestAccess />
                </div>

                {/* Quick contact */}
                <div className="bg-fill/5 border border-edge/10 p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Contact us
                  </h3>
                  <a
                    href="mailto:hello@genfeed.ai"
                    className="flex items-center gap-3 text-sm text-muted-foreground hover:text-surface transition-colors"
                  >
                    <HiOutlineEnvelope className="w-5 h-5" />
                    hello@genfeed.ai
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile CTA - only visible on mobile */}
        <section className="lg:hidden w-full pb-20 px-8">
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 p-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-2 bg-primary/20 text-primary">
                <HiOutlineChatBubbleLeftRight className="w-5 h-5" />
              </div>
              <h3 className="font-semibold">Still have questions?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Sign up and we&apos;ll answer during onboarding.
            </p>
            <ButtonRequestAccess />
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
