'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { LuArrowRight } from 'react-icons/lu';

export default function HomeCTA(): React.ReactElement {
  return (
    <section className="gen-section-spacing-xl relative overflow-hidden gen-grain">
      <div className="container mx-auto px-6 relative z-10">
        <VStack className="items-center text-center gap-8 max-w-3xl mx-auto">
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-none tracking-[-0.03em] sm:text-6xl md:text-7xl"
          >
            Ship on-brand content, faster.
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            Generate, review, schedule, and publish from one workspace — with a
            human in the approval seat. Book a demo if you&apos;re rolling this
            out across a team or client roster.
          </Text>

          <HStack className="flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_free_bottom_cta' }}
              trackingName="cta_final_click"
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start for free
                <LuArrowRight className="size-4" />
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'book_demo_bottom_cta' }}
              trackingName="cta_final_click"
              variant={ButtonVariant.OUTLINE}
            >
              <a
                href={EnvironmentService.calendly}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a Demo
              </a>
            </ButtonTracked>
          </HStack>
        </VStack>
      </div>
    </section>
  );
}
