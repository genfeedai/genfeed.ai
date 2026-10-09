import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptBarCrunControls from './PromptBarCrunControls';

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      pages: { studioPlayground: { crun: { outputFormat: 'Output format' } } },
    }),
  };
});
const controls: CrunInputControls = {
  version: 'reviewed',
  endpoint: 'google/nano-banana-pro',
  mediaKind: 'image',
  maxOutputs: 4,
  isBatchSupported: false,
  referenceRoles: {},
  isAutoAspectReferenceRequired: true,
  fields: {
    output_format: {
      type: 'string',
      isRequired: false,
      default: 'png',
      enum: ['png', 'jpg'],
    },
  },
};

describe('Crun output format', () => {
  it('uses the reviewed default and exposes an accessible control', () => {
    render(<PromptBarCrunControls controls={controls} onChange={vi.fn()} />);
    expect(
      screen.getByRole('combobox', { name: 'Output format' }),
    ).toHaveTextContent('PNG');
  });
  it('disables editing while submitting and associates validation with the control', () => {
    render(
      <PromptBarCrunControls
        controls={controls}
        isDisabled
        error="Unsupported format"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-description',
      'Unsupported format',
    );
  });
  it('renders no output-format control for Seedream', () => {
    render(
      <PromptBarCrunControls
        controls={{ ...controls, fields: {} }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('opens supported options with the keyboard', () => {
    render(<PromptBarCrunControls controls={controls} onChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'JPG' })).toBeInTheDocument();
  });
});
