'use client';

import Card from '@ui/card/Card';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import type { ReactNode } from 'react';

/** Reusable card section with title, used across detail pages */
export function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="border border-white/[0.08]">
      <VStack gap={4} className="p-6">
        <Heading size="lg">{title}</Heading>
        {children}
      </VStack>
    </Card>
  );
}

/** Metadata row: label + value */
export function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Text size="sm" weight="medium">
        {label}:{' '}
      </Text>
      <Text size="sm" color="subtle-70">
        {children}
      </Text>
    </div>
  );
}
