'use client';

import { FAQ_ITEMS_CORE } from '@data/faq.data';
import { CardVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { SectionHeader } from '@ui/sections/header';
import { HiQuestionMarkCircle } from 'react-icons/hi2';

export default function HomeFAQ() {
  return (
    <section id="faq" className="gen-section-spacing">
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <SectionHeader
            icon={HiQuestionMarkCircle}
            label="FAQ"
            title={
              <>
                Questions<span className="font-light">?</span>
              </>
            }
          />

          <Card
            variant={CardVariant.DEFAULT}
            className="p-8"
            bodyClassName="p-0"
          >
            <Accordion type="single" collapsible defaultValue="item-0">
              {FAQ_ITEMS_CORE.map((item, idx) => (
                <AccordionItem
                  key={item.question}
                  value={`item-${idx}`}
                  className="border-edge/10"
                >
                  <AccordionTrigger className="text-lg font-medium text-left py-4 hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground/60 pb-4">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>
      </div>
    </section>
  );
}
