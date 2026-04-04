'use client';

import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import type { ReactNode } from 'react';
import { HiLightBulb } from 'react-icons/hi2';

export default function PromptsList(): ReactNode {
  return (
    <Container className="min-h-[60vh] flex items-center justify-center">
      <CardEmpty
        icon={HiLightBulb}
        label="Prompts Coming Soon"
        description="Expertly crafted prompts for AI generation will be available here soon."
        size="lg"
      />
    </Container>
  );
}
