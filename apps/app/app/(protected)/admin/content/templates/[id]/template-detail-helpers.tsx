'use client';

import Card from '@ui/card/Card';
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
    <Card>
      <div className="flex flex-col gap-4 p-6">
        <Heading size="lg">{title}</Heading>
        {children}
      </div>
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
