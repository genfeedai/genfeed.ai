import '@testing-library/jest-dom/vitest';
import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import type { IElementBlacklist } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarBlacklistSelector from '@ui/prompt-bars/components/blacklist-selector/PromptBarBlacklistSelector';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

function buildBlacklist(key: string, label: string): IElementBlacklist {
  return {
    createdAt: '2024-01-01',
    id: `blacklist-${key}`,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key,
    label,
    updatedAt: '2024-01-01',
  } as IElementBlacklist;
}

const BLACKLISTS = [
  buildBlacklist('text', 'No text'),
  buildBlacklist('watermark', 'No watermark'),
];

function Wrapper({
  blacklists = BLACKLISTS,
  blacklist = [],
  onChange,
}: {
  blacklists?: IElementBlacklist[];
  blacklist?: string[];
  onChange?: () => void;
}) {
  const form = useForm<PromptTextareaSchema>({ defaultValues: { blacklist } });

  return (
    <>
      <PromptBarBlacklistSelector
        blacklists={blacklists}
        form={form}
        controlClass=""
        isDisabled={false}
        onChange={onChange}
      />
      <output data-testid="selected">
        {JSON.stringify(form.watch('blacklist'))}
      </output>
    </>
  );
}

describe('PromptBarBlacklistSelector', () => {
  it('renders nothing when there is nothing to avoid', () => {
    const { container } = render(<Wrapper blacklists={[]} />);

    expect(container.querySelector('button')).toBeNull();
  });

  it('shows how many entries are selected', () => {
    render(<Wrapper blacklist={['text']} />);

    expect(
      screen.getByRole('button', { name: /choose what to avoid/i }),
    ).toHaveTextContent('1');
  });

  it('adds and removes the key of the toggled entry', () => {
    const onChange = vi.fn();
    render(<Wrapper onChange={onChange} />);

    fireEvent.click(
      screen.getByRole('button', { name: /choose what to avoid/i }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /no text/i }));

    expect(screen.getByTestId('selected')).toHaveTextContent('["text"]');
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: /no text/i }));

    expect(screen.getByTestId('selected')).toHaveTextContent('[]');
  });
});
