import { render, screen } from '@testing-library/react';
import GenerationHarnessReceipt from '@ui/ingredients/tabs/prompts/GenerationHarnessReceipt';
import { describe, expect, it } from 'vitest';

describe('GenerationHarnessReceipt', () => {
  it('shows the exact submitted prompt and sanitized context receipt', () => {
    render(<GenerationHarnessReceipt receipt={{ originalPrompt: 'A cat', enhancedPrompt: 'A cat beside a sunlit window.', status: 'applied', source: 'brand', brandId: 'brand-1', appliedPacks: [{ id: 'brand-fidelity', version: '1.0' }] }} />);
    expect(screen.getByText('A cat beside a sunlit window.')).toBeInTheDocument();
    expect(screen.getByText('Prompt enhanced')).toBeInTheDocument();
    expect(screen.getByText('brand-fidelity · 1.0')).toBeInTheDocument();
  });
  it('distinguishes skipped enhancement from an applied rewrite', () => {
    render(<GenerationHarnessReceipt receipt={{ originalPrompt: 'raw', enhancedPrompt: 'raw', status: 'skipped', source: 'request', brandId: 'brand-1', appliedPacks: [] }} />);
    expect(screen.getByText('Enhancement skipped')).toBeInTheDocument();
    expect(screen.getByText('This generation’s override')).toBeInTheDocument();
    expect(screen.queryByText('Applied context')).not.toBeInTheDocument();
  });
});
