'use client';

import { ButtonSize } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { LuArrowRight } from 'react-icons/lu';

export default function HomeCTA(): React.ReactElement {
  return (
    <section className="gen-section-spacing-xl relative overflow-hidden gen-vignette gen-spotlight-left gen-grain">
      <div className="container mx-auto px-6 relative z-10">
        <VStack className="items-center text-center gap-8 max-w-3xl mx-auto">
          <Heading
            as="h2"
            className="text-5xl sm:text-6xl md:text-7xl font-serif tracking-tighter leading-none"
          >
            Run every brand from
            <br />
            <span className="font-light italic gen-text-heading">
              one content system.
            </span>
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            Start with research, creation, publishing, and KPI tracking in one
            workflow built for agencies and multi-brand teams.
          </Text>

          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            className="shadow-[var(--shadow-glow-md)]"
            trackingName="cta_final_click"
            trackingData={{ action: 'signup_bottom_cta' }}
          >
            <a
              href={`${EnvironmentService.apps.app}/sign-up`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start Your Workflow
              <LuArrowRight className="h-4 w-4" />
            </a>
          </ButtonTracked>
        </VStack>
      </div>
    </section>
  );
}
