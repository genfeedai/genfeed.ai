'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { LuArrowRight } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

export default function HomeCTA(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section className="gen-section-spacing-xl relative overflow-hidden gen-grain">
      <div className="container mx-auto px-6 relative z-10">
        <VStack className="items-center text-center gap-8 max-w-3xl mx-auto">
          <Heading
            as="h2"
            className="text-5xl sm:text-6xl md:text-7xl font-serif tracking-normal leading-none"
          >
            Start with the cloud app.
            <br />
            <span className="font-light italic gen-text-heading">
              Scale usage as output grows.
            </span>
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            The shortest path is managed Genfeed: no deployment, no model
            routing, no quota guessing. Book a demo when a team workflow needs
            design before rollout.
          </Text>

          <HStack className="flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'signup_bottom_cta' }}
              trackingName="cta_final_click"
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Start Cloud App
                <LuArrowRight className="h-4 w-4" />
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'book_demo_bottom_cta' }}
              trackingName="cta_final_click"
              variant={ButtonVariant.OUTLINE}
            >
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                Book a Demo
              </a>
            </ButtonTracked>
          </HStack>
        </VStack>
      </div>
    </section>
  );
}
