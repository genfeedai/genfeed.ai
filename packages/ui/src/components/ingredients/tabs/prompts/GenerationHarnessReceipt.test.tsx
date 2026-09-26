import { render, screen } from '@testing-library/react';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import messages from '../../../../../../../apps/app/messages/en/ui.json';

function EnglishMessages({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ ui: messages }}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('GenerationHarnessReceipt', () => {
  it('shows the exact submitted prompt and sanitized context receipt', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          originalPrompt: 'A cat',
          enhancedPrompt: 'A cat beside a sunlit window.',
          status: 'applied',
          source: 'brand',
          brandId: 'brand-1',
          appliedPacks: [{ id: 'brand-fidelity', version: '1.0' }],
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(
      screen.getByText('A cat beside a sunlit window.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Prompt enhanced')).toBeInTheDocument();
    expect(screen.getByText('brand-fidelity · 1.0')).toBeInTheDocument();
  });
  it('lists the exact Knowledge versions folded into the prompt', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          originalPrompt: 'Mascot poster',
          enhancedPrompt: 'Mascot poster with a teal heron.',
          status: 'applied',
          source: 'request',
          brandId: 'brand-1',
          appliedPacks: [],
          knowledgeReceipts: [
            {
              excerpt: 'Our mascot is a teal heron named Pim.',
              kind: 'TEXT',
              purpose: 'BRAND_TRUTH',
              relevance: 0.55,
              sourceId: 'source-1',
              title: 'Brand facts',
              version: 2,
              versionId: 'version-2',
            } as never,
          ],
        }}
      />,
      { wrapper: EnglishMessages },
    );

    const receipts = screen.getByRole('region', { name: 'Knowledge sources' });
    expect(receipts).toHaveTextContent('Brand facts');
    expect(receipts).toHaveTextContent('Brand Truth');
    expect(receipts).toHaveTextContent('Version 2');
    expect(receipts).toHaveTextContent('Our mascot is a teal heron named Pim.');
  });

  it('distinguishes skipped enhancement from an applied rewrite', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          originalPrompt: 'raw',
          enhancedPrompt: 'raw',
          status: 'skipped',
          source: 'request',
          brandId: 'brand-1',
          appliedPacks: [],
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(screen.getByText('Enhancement skipped')).toBeInTheDocument();
    expect(screen.getByText('This generation’s override')).toBeInTheDocument();
    expect(screen.queryByText('Applied context')).not.toBeInTheDocument();
  });
});
