import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { ArrowRight } from 'lucide-react';

export default function HomeCTA(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-none tracking-[-0.03em] sm:text-6xl"
          >
            Ship on-brand content, faster.
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            One workspace, a human in the approval seat. Book a demo if
            you&apos;re rolling this out across a team or client roster.
          </Text>

          <div className="flex flex-row items-center flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_free_bottom_cta' }}
              trackingName="cta_final_click"
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start for free
                <ArrowRight className="size-4" />
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'book_demo_bottom_cta' }}
              trackingName="cta_final_click"
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={EnvironmentService.calendly}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a Demo
              </a>
            </ButtonTracked>
          </div>
        </div>
      </div>
    </section>
  );
}
