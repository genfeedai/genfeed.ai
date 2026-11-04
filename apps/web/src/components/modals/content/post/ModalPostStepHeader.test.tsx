import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalPostStepHeader from '@/components/modals/content/post/ModalPostStepHeader';

describe('ModalPostStepHeader', () => {
  it('introduces the details step without a back arrow', () => {
    render(<ModalPostStepHeader activeTab="setup" onBack={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Schedule post' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back to details' }),
    ).not.toBeInTheDocument();
  });

  it('goes back from the channels step', () => {
    const onBack = vi.fn();
    render(<ModalPostStepHeader activeTab="platforms" onBack={onBack} />);

    expect(
      screen.getByRole('heading', { name: 'Choose channels' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to details' }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
