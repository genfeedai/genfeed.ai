import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';

export default function HomeCTA(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
          data-reveal="up"
        >
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-none tracking-[-0.03em] sm:text-6xl"
          >
            Start with one brief.
          </Heading>

          <div className="flex flex-row items-center flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_creating_bottom_cta' }}
              trackingName="home_cta_click"
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start creating
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'book_demo_bottom_cta' }}
              trackingName="home_cta_click"
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={EnvironmentService.calendly}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a demo
              </a>
            </ButtonTracked>
          </div>
        </div>
      </div>
    </section>
  );
}
