import { FAQ_ITEMS_CORE } from '@data/faq.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/65';

export default function HomeFAQ(): React.ReactElement {
  return (
    <section id="faq" className="gen-section-spacing border-b border-edge/5">
      <div className="container mx-auto max-w-3xl px-6">
        <div className="flex flex-col mb-8 gap-4">
          <Text className={EYEBROW_CLASS}>FAQ</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Common questions, answered.
          </Heading>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQ_ITEMS_CORE.map((item) => (
            <AccordionItem
              key={item.question}
              value={item.question}
              className="border border-edge/5 px-4"
            >
              <AccordionTrigger className="py-4 text-left text-base font-medium hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-4 leading-relaxed text-surface/72">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex flex-row items-center gap-4 mt-8">
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="faq_view_all_click"
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/faq">
              See all FAQs
              <ArrowRight className="size-3" />
            </Link>
          </ButtonTracked>
        </div>
      </div>
    </section>
  );
}
