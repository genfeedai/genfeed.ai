import type { CrunInputControls } from '@genfeedai/contracts/interfaces/content/crun-contract.interface';
import type { GenerationSetupSearchProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupSearch from '@ui/dropdowns/generation-setup/GenerationSetupSearch';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@ui/primitives/command', () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: () => null,
  CommandInput: () => null,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: () => void;
  }) => (
    <button onClick={onSelect} type="button">
      {children}
    </button>
  ),
}));
const controls = {
  maxOutputs: 4,
  isAutoAspectReferenceRequired: true,
  fields: { aspect_ratio: { enum: ['1:1', '21:9', 'auto'] } },
} as unknown as CrunInputControls;
function props(referenceCount: number): GenerationSetupSearchProps {
  return {
    inputControls: controls,
    referenceCount,
    capabilities: { hasAspectRatio: true, hasOutputs: true },
    lookOptions: {},
    models: [],
    typeOptions: [],
    setup: {
      sources: {},
      values: { type: 'image', aspectRatio: '1:1', outputs: 1 },
    },
    onBack: vi.fn(),
    onSetField: vi.fn(),
  } as unknown as GenerationSetupSearchProps;
}
describe('reviewed Crun setup search', () => {
  it('selects exact 21:9 and auto values and excludes excessive counts', () => {
    const input = props(1);
    render(<GenerationSetupSearch {...input} />);
    fireEvent.click(screen.getByText('21:9'));
    expect(input.onSetField).toHaveBeenCalledWith('aspectRatio', '21:9');
    fireEvent.click(screen.getByText('auto'));
    expect(input.onSetField).toHaveBeenCalledWith('aspectRatio', 'auto');
    expect(screen.getByText('4 outputs')).toBeInTheDocument();
    expect(screen.queryByText('8 outputs')).not.toBeInTheDocument();
  });
  it('does not offer auto without its required reference', () => {
    render(<GenerationSetupSearch {...props(0)} />);
    expect(screen.queryByText('auto')).not.toBeInTheDocument();
  });
});
