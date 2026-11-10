import { FAQ_ITEMS_HOME } from '@data/faq.data';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Heading } from '@ui/typography/heading';
import Link from 'next/link';

/** The questions a first visit ends on, answered from the same data as /faq. */
export default function HomeFaq(): React.ReactElement {
  return (
    <section
      id="faq"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] lg:gap-20">
        <div className="flex flex-col gap-5" data-reveal="up">
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          >
            Questions.
          </Heading>
          <Link
            className="text-sm font-semibold text-foreground/80 underline underline-offset-4 transition-colors hover:text-foreground"
            href="/faq"
          >
            Read every answer
          </Link>
        </div>

        <Accordion collapsible data-reveal="up" type="single">
          {FAQ_ITEMS_HOME.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
