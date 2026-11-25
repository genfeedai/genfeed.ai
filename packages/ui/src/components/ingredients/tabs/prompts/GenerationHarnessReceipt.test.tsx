import { render, screen } from '@testing-library/react';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import messages from '../../../../../../../apps/web/messages/en/ui.json';

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

  it.each([
    ['approved_brand', 'Approved brand', undefined],
    [
      'provisional_brand',
      'Provisional brand',
      'Your brand kit is not approved yet. This was generated from the draft kit and is not checked for compliance.',
    ],
    [
      'raw',
      'Not branded',
      'The prompt was sent exactly as typed. No brand was applied.',
    ],
  ] as const)(
    'states how the %s generation treated the brand',
    (brandMode, label, hint) => {
      render(
        <GenerationHarnessReceipt
          receipt={{
            originalPrompt: 'A cat',
            enhancedPrompt: 'A cat',
            status: brandMode === 'raw' ? 'skipped' : 'applied',
            source: 'brand',
            brandId: 'brand-1',
            brandMode,
            appliedPacks: [],
          }}
        />,
        { wrapper: EnglishMessages },
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      if (hint) expect(screen.getByText(hint)).toBeInTheDocument();
      else
        expect(
          screen.queryByText(/not approved yet|exactly as typed/),
        ).not.toBeInTheDocument();
    },
  );

  it('shows no brand badge for a receipt written before brand modes existed', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          originalPrompt: 'old',
          enhancedPrompt: 'old',
          status: 'skipped',
          source: 'default',
          brandId: 'brand-1',
          appliedPacks: [],
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(screen.queryByText('Not branded')).not.toBeInTheDocument();
    expect(screen.queryByText('Provisional brand')).not.toBeInTheDocument();
  });

  it('tells the member when enhancement failed and the prompt went as typed', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          originalPrompt: 'A cat',
          enhancedPrompt: 'A cat',
          status: 'skipped',
          isEnhancementFailed: true,
          brandMode: 'raw',
          source: 'brand',
          brandId: 'brand-1',
          appliedPacks: [],
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(screen.getByText(/Brand enhancement failed/)).toBeInTheDocument();
    expect(screen.queryByText(/exactly as typed/)).not.toBeInTheDocument();
  });

  const brandedReceipt = {
    originalPrompt: 'A cat',
    enhancedPrompt: 'A cat on a brand-blue sofa',
    status: 'applied' as const,
    brandMode: 'approved_brand' as const,
    source: 'brand' as const,
    brandId: 'brand-1',
    appliedPacks: [],
  };

  it('lists each approved colour with how much of the output it covers', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          ...brandedReceipt,
          brandPalette: {
            status: 'measured',
            colors: [
              {
                id: 'blue',
                hex: '#123456',
                usage: 'Primary',
                isRequired: true,
                coverage: 0.34,
                result: 'found',
              },
              {
                id: 'gold',
                hex: '#C9A27A',
                usage: 'Accent',
                isRequired: false,
                coverage: 0,
                result: 'absent',
              },
            ],
          },
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(screen.getByText('Palette check')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 colours found')).toBeInTheDocument();
    expect(screen.getByText('34% of the output')).toBeInTheDocument();
    expect(screen.getByText('0% of the output')).toBeInTheDocument();
    expect(screen.getByText('Found')).toBeInTheDocument();
    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.getByText(/A miss is information/)).toBeInTheDocument();
  });

  it('says the receipt records a failed check when a required colour is missing', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          ...brandedReceipt,
          brandPalette: {
            status: 'measured',
            colors: [
              {
                id: 'blue',
                hex: '#123456',
                isRequired: true,
                coverage: 0,
                result: 'absent',
              },
            ],
          },
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(
      screen.getByText(/A required colour is missing/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/A miss is information/)).not.toBeInTheDocument();
  });

  it('says why the palette was not measured', () => {
    render(
      <GenerationHarnessReceipt
        receipt={{
          ...brandedReceipt,
          brandPalette: {
            status: 'not_measured',
            reasonCode: 'visual_composite_unproven',
          },
        }}
      />,
      { wrapper: EnglishMessages },
    );
    expect(
      screen.getByText(
        'Not measured. A layer is placed over this output, so its final pixels are not proven.',
      ),
    ).toBeInTheDocument();
  });

  it('shows no palette check until one was measured', () => {
    render(<GenerationHarnessReceipt receipt={brandedReceipt} />, {
      wrapper: EnglishMessages,
    });
    expect(screen.queryByText('Palette check')).not.toBeInTheDocument();
  });
});
