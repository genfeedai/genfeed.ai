import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupResetButton from '@ui/dropdowns/generation-setup/GenerationSetupResetButton';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('GenerationSetupResetButton', () => {
  it('resets everything on click', () => {
    const onResetAll = vi.fn();
    render(<GenerationSetupResetButton onResetAll={onResetAll} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  it('stays in place but disabled when there is nothing to reset', () => {
    const onResetAll = vi.fn();
    render(<GenerationSetupResetButton isDisabled onResetAll={onResetAll} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onResetAll).not.toHaveBeenCalled();
  });
});
