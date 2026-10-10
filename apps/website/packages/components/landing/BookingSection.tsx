import { BOOKING_HREF, BOOKING_SECTION_ID } from '@data/booking.data';
import { ButtonSize } from '@genfeedai/contracts';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import SectionHeader from '@ui/marketing/SectionHeader';
import { WebSection } from '@web-components/content/NeuralGrid';
import { ArrowUpRight } from 'lucide-react';

export default function BookingSection(): React.ReactElement {
  return (
    <WebSection
      bg="bordered"
      className="scroll-mt-20"
      id={BOOKING_SECTION_ID}
      maxWidth="lg"
    >
      <SectionHeader
        title="Book a call"
        description="30 minutes on your channels, output target, and fit. If done-for-you makes sense, we scope it on the call. If it does not, you leave with a plan you can run yourself on Genfeed."
        className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
      />
      <ButtonTracked
        asChild
        size={ButtonSize.PUBLIC}
        trackingData={{ action: 'book_call', page: 'done-for-you' }}
        trackingName="service_landing_click"
      >
        <a href={BOOKING_HREF} target="_blank" rel="noopener noreferrer">
          Book a call <ArrowUpRight className="size-4" />
        </a>
      </ButtonTracked>
    </WebSection>
  );
}
