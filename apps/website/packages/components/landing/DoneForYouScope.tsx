import { BOOKING_HREF } from '@data/booking.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import SectionHeader from '@ui/marketing/SectionHeader';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import {
  DONE_FOR_YOU_FOCUS_LINKS,
  DONE_FOR_YOU_SCOPE_OPTIONS,
} from '@web-components/landing/done-for-you-scope.data';
import { Check } from 'lucide-react';
import Link from 'next/link';

/*
  Everything a call can scope, on the page where the call is booked: the
  smaller engagements and the focused pages that used to hang off /services.
*/
export default function DoneForYouScope(): React.ReactElement {
  return (
    <>
      <WebSection maxWidth="xl" className="gsap-section">
        <SectionHeader
          title="Smaller scopes"
          description="Not ready to hand it all over? The same call can scope a lighter engagement."
          className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
        />

        <NeuralGrid columns={2}>
          {DONE_FOR_YOU_SCOPE_OPTIONS.map((option) => (
            <NeuralGridItem
              key={option.label}
              padding="lg"
              title={option.label}
              description={option.description}
            >
              <ul className="mt-6 space-y-4">
                {option.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-surface/55" />
                    <span className="text-sm text-surface/65">{feature}</span>
                  </li>
                ))}
              </ul>
              <ButtonTracked
                asChild
                className="mt-10 w-full"
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'book_call', scope: option.label }}
                trackingName="done_for_you_scope_click"
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={BOOKING_HREF}>Book a call</Link>
              </ButtonTracked>
            </NeuralGridItem>
          ))}
        </NeuralGrid>
      </WebSection>

      <WebSection bg="bordered" maxWidth="md" className="gsap-section">
        <SectionHeader
          title="Pick your focus"
          description="Explore the channels and content workflows we can help you run."
          className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
        />
        <div className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-2">
          {DONE_FOR_YOU_FOCUS_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between bg-background p-4 transition-colors hover:bg-fill/[0.02]"
            >
              <span className="text-xs font-black uppercase tracking-widest text-surface/60">
                {item.label}
              </span>
              <span className="text-sm font-semibold text-surface">→</span>
            </Link>
          ))}
        </div>
      </WebSection>
    </>
  );
}
