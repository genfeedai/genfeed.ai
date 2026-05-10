'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import {
  HiArrowPathRoundedSquare,
  HiBolt,
  HiChartBarSquare,
  HiCheckCircle,
  HiCloud,
  HiSparkles,
  HiUsers,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const PROOF_POINTS = [
  'Managed workspace',
  'PAYG output',
  'No model setup',
] as const;

const CLOUD_FLOW = [
  {
    detail: 'Briefs, brand rules, and campaign context stay in one place.',
    icon: HiSparkles,
    label: 'Plan',
  },
  {
    detail: 'Generate video, images, voice, and posts with managed models.',
    icon: HiBolt,
    label: 'Create',
  },
  {
    detail: 'Review, approve, schedule, and track output from the same app.',
    icon: HiChartBarSquare,
    label: 'Publish',
  },
] as const;

const OPERATING_STATS = [
  { label: 'Workspace', value: 'Cloud app' },
  { label: 'Billing', value: '$8/mo + PAYG' },
  { label: 'Scale path', value: 'Teams from $499/mo' },
] as const;

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

export default function HomeHero(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section className="relative overflow-hidden border-b border-edge/5 gen-vignette gen-grain">
      <div className="container relative z-10 mx-auto px-6">
        <div className="grid min-h-[calc(100svh-5rem)] items-center gap-12 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] lg:gap-16">
          <VStack className="max-w-3xl gap-8">
            <HStack className="inline-flex w-fit items-center gap-2 px-4 py-1.5 gen-badge text-[10px] font-black uppercase tracking-[0.18em]">
              <HiCloud className="h-3.5 w-3.5" />
              <Text>Cloud app first</Text>
            </HStack>

            <VStack className="gap-5">
              <Heading
                as="h1"
                className="max-w-4xl text-5xl font-serif leading-[0.95] tracking-normal sm:text-6xl lg:text-[5.75rem]"
              >
                Create and publish content from one managed AI workspace.
              </Heading>

              <Text
                as="p"
                className="max-w-2xl text-base leading-7 gen-text-muted md:text-xl"
              >
                Genfeed Cloud gives you the app, models, publishing workflow,
                and billing in one place. Pay for platform access, then pay only
                for the output you create.
              </Text>
            </VStack>

            <HStack className="flex-wrap gap-3">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'signup_cloud_app_hero' }}
                trackingName="hero_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Start Cloud App
                  <LuArrowRight className="h-4 w-4" />
                </a>
              </ButtonTracked>

              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'book_demo_hero' }}
                trackingName="hero_cta_click"
                variant={ButtonVariant.OUTLINE}
              >
                <a
                  href={CALENDLY_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Book a Demo
                </a>
              </ButtonTracked>

              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'view_pricing_hero' }}
                trackingName="hero_cta_click"
                variant={ButtonVariant.GHOST}
              >
                <Link href="/pricing">View Pricing</Link>
              </ButtonTracked>
            </HStack>

            <div className="grid w-full max-w-2xl grid-cols-1 gap-px overflow-hidden border border-edge/5 bg-fill/5 sm:grid-cols-3">
              {PROOF_POINTS.map((point) => (
                <HStack
                  key={point}
                  className="items-center gap-2 bg-background px-4 py-3 text-sm text-surface/60"
                >
                  <HiCheckCircle className="h-4 w-4 text-success" />
                  <Text>{point}</Text>
                </HStack>
              ))}
            </div>
          </VStack>

          <div
            className="relative w-full"
            data-testid="home-hero-cloud-console"
          >
            <div className="overflow-hidden border border-edge/10 bg-fill/[0.025] shadow-[0_28px_90px_rgba(0,0,0,0.35)]">
              <HStack className="items-center justify-between border-b border-edge/5 px-5 py-4">
                <HStack className="items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center bg-inv text-inv-fg">
                    <HiCloud className="h-5 w-5" />
                  </div>
                  <VStack className="gap-0">
                    <Text className="text-sm font-semibold text-surface">
                      Genfeed Cloud
                    </Text>
                    <Text className="text-xs text-surface/40">
                      Managed content workspace
                    </Text>
                  </VStack>
                </HStack>
                <HStack className="items-center gap-2 text-xs text-surface/45">
                  <HiArrowPathRoundedSquare className="h-4 w-4" />
                  <Text>Live workflow</Text>
                </HStack>
              </HStack>

              <div className="grid gap-px bg-fill/5 md:grid-cols-3">
                {OPERATING_STATS.map((stat) => (
                  <VStack key={stat.label} className="gap-1 bg-background p-5">
                    <Text className="text-[10px] font-black uppercase tracking-[0.16em] text-surface/30">
                      {stat.label}
                    </Text>
                    <Text className="text-lg font-semibold text-surface">
                      {stat.value}
                    </Text>
                  </VStack>
                ))}
              </div>

              <div className="space-y-3 p-5">
                {CLOUD_FLOW.map((step, index) => {
                  const Icon = step.icon;

                  return (
                    <div
                      key={step.label}
                      className="grid grid-cols-[auto_1fr] gap-4 border border-edge/5 bg-fill/[0.025] p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center bg-fill/10 text-surface">
                        <Icon className="h-5 w-5" />
                      </div>
                      <VStack className="gap-1">
                        <Text className="text-xs font-black uppercase tracking-[0.16em] text-surface/35">
                          {String(index + 1).padStart(2, '0')} / {step.label}
                        </Text>
                        <Text className="text-sm leading-6 text-surface/65">
                          {step.detail}
                        </Text>
                      </VStack>
                    </div>
                  );
                })}
              </div>

              <HStack className="items-center justify-between border-t border-edge/5 px-5 py-4">
                <HStack className="items-center gap-2 text-sm text-surface/55">
                  <HiUsers className="h-4 w-4" />
                  <Text>
                    Upgrade to teams when collaboration is the bottleneck.
                  </Text>
                </HStack>
                <Link
                  className="text-xs font-bold uppercase tracking-[0.16em] text-surface/50 hover:text-surface"
                  href="/cloud"
                >
                  Cloud details
                </Link>
              </HStack>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
