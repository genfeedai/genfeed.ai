'use client';

import { ButtonSize } from '@genfeedai/enums';
import { getProPlan } from '@helpers/business/pricing/pricing.helper';
import type { AudienceBenefit } from '@props/website/home.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiBuildingOffice2, HiUser } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/65';

const CREATOR_BENEFITS: AudienceBenefit[] = [
  { label: 'Generate posts, images, and video from one brief' },
  { label: 'Review and approve content before it ships' },
  { label: 'Schedule and track performance across every channel' },
];

const AGENCY_BENEFITS: AudienceBenefit[] = [
  { label: 'Spin up ad creative and variations at volume for every campaign' },
  { label: 'A dedicated workspace and approval flow per client' },
  { label: 'Show clients exactly which creative drove sales' },
];

export default function HomeAudiences(): React.ReactElement {
  const proPlan = getProPlan();
  const proPlanPrice = proPlan.launchPrice ?? proPlan.price;
  const proPlanCopy =
    proPlanPrice != null
      ? `Free to start, then $${proPlanPrice}/mo Pro for cheaper credits and more brands`
      : 'Free to start, then upgrade to Pro for cheaper credits and more brands';

  return (
    <section
      id="audiences"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <VStack className="mb-12 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>Who it&apos;s for</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            For creators and marketing teams.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Run your own content self-serve, or bring your whole client roster
            and manage every brand from one supervised workspace.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-px bg-edge/5 lg:grid-cols-2">
          <div className="flex flex-col gap-5 bg-background p-8">
            <HStack className="items-center gap-2 text-surface/72">
              <HiUser className="size-4" />
              <Text className={EYEBROW_CLASS}>
                Creators &amp; solo marketers
              </Text>
            </HStack>
            <Heading as="h3" className="text-2xl font-semibold text-surface">
              Everything you publish, in one studio.
            </Heading>
            <ul className="flex flex-col gap-3">
              {CREATOR_BENEFITS.map((benefit) => (
                <li key={benefit.label} className="flex items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-surface/70" />
                  <Text className="text-sm leading-6 text-surface/72">
                    {benefit.label}
                  </Text>
                </li>
              ))}
            </ul>
            <Text className="text-xs leading-5 text-surface/60">
              {proPlanCopy}
            </Text>
            <HStack className="mt-auto flex-wrap items-center gap-4 pt-2">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'start_free_audience' }}
                trackingName="audience_cta_click"
              >
                <a href={`${EnvironmentService.apps.app}/sign-up`}>
                  Start for free
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>
              <Link
                href="#how"
                className="text-sm font-medium text-surface/72 underline-offset-4 hover:text-surface hover:underline"
              >
                See how it works →
              </Link>
            </HStack>
          </div>

          <div className="flex flex-col gap-5 bg-background p-8">
            <HStack className="items-center justify-between">
              <HStack className="items-center gap-2 text-surface/72">
                <HiBuildingOffice2 className="size-4" />
                <Text className={EYEBROW_CLASS}>
                  Agencies &amp; paid social
                </Text>
              </HStack>
              <HStack className="items-center gap-1.5 rounded-full bg-surface/10 px-2.5 py-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-surface/70">
                  Talk to us
                </Text>
              </HStack>
            </HStack>
            <Heading as="h3" className="text-2xl font-semibold text-surface">
              Run every client&apos;s creative from one place.
            </Heading>
            <ul className="flex flex-col gap-3">
              {AGENCY_BENEFITS.map((benefit) => (
                <li key={benefit.label} className="flex items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-surface/70" />
                  <Text className="text-sm leading-6 text-surface/72">
                    {benefit.label}
                  </Text>
                </li>
              ))}
            </ul>
            <Text className="text-xs leading-5 text-surface/60">
              Scale: multi-client workspaces, approvals, managed billing
            </Text>
            <HStack className="mt-auto flex-wrap items-center gap-4 pt-2">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'book_demo_agencies_audience' }}
                trackingName="audience_cta_click"
              >
                <a
                  href={EnvironmentService.calendly}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Book a Demo
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>
              <Link
                href="/use-cases/agencies"
                className="text-sm font-medium text-surface/72 underline-offset-4 hover:text-surface hover:underline"
              >
                Genfeed for agencies →
              </Link>
            </HStack>
          </div>
        </div>
      </div>
    </section>
  );
}
