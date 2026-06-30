'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { LuArrowRight, LuBadgeCheck, LuLayers } from 'react-icons/lu';

const BRAND_OS_SIGNALS = [
  'Evidence before recommendations',
  'Missing fields stay visible',
  'Save into a brand workspace',
] as const;

export default function HomeBrandOS(): React.ReactElement {
  return (
    <section className="border-b border-edge/5 bg-fill/[0.02] py-20">
      <div className="container mx-auto px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(300px,0.5fr)] lg:items-end">
          <VStack className="gap-5">
            <HStack className="w-fit items-center gap-2 border border-edge/10 bg-background px-3 py-1.5 text-[10px] font-black uppercase text-surface/40">
              <LuLayers className="size-3.5" />
              <Text>Brand OS</Text>
            </HStack>
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-serif leading-tight text-surface sm:text-5xl"
            >
              Build a source-backed brand system before you generate.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 text-surface/55">
              Start from a public URL or manual guidance, inspect evidence and
              missing fields, then save the draft into Genfeed when it is ready.
            </Text>
          </VStack>

          <VStack className="gap-5 border border-edge/5 bg-background p-5">
            <ul className="space-y-3">
              {BRAND_OS_SIGNALS.map((signal) => (
                <li
                  className="flex items-center gap-3 text-sm text-surface/60"
                  key={signal}
                >
                  <LuBadgeCheck className="size-4 shrink-0 text-success" />
                  {signal}
                </li>
              ))}
            </ul>
            <ButtonTracked
              asChild
              className="w-full justify-center"
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'home_brand_os_entry' }}
              trackingName="home_brand_os_click"
              variant={ButtonVariant.OUTLINE}
            >
              <Link href="/brand-os">
                Preview Brand OS
                <LuArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
          </VStack>
        </div>
      </div>
    </section>
  );
}
