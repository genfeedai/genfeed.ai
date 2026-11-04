import { render, screen } from '@testing-library/react';
import { type FormEvent, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModalPostFooter from '@/components/modals/content/post/ModalPostFooter';

interface WizardHarnessProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface ActEnvironment {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

// Mirrors the publishing wizard: Next/Back change the step inside the click
// handler, so the footer re-renders while the click is still being dispatched.
function WizardHarness({ onSubmit }: WizardHarnessProps) {
  const [activeTab, setActiveTab] = useState<'setup' | 'platforms'>('setup');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event);
      }}
    >
      <ModalPostFooter
        activeTab={activeTab}
        globalDescription="A caption"
        globalLabel="A title"
        globalScheduledDate={new Date('2026-11-05T21:00:00.000Z')}
        hasYoutube
        isFormValid
        isLoading={false}
        onClose={vi.fn()}
        onNextStep={() => setActiveTab('platforms')}
        onPreviousStep={() => setActiveTab('setup')}
      />
    </form>
  );
}

// A real browser click: React flushes the step change before the browser runs
// the click's default action. Wrapping the click in act() would defer that
// flush and hide the bug, so the click is dispatched outside act.
function clickLikeBrowser(button: HTMLElement) {
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  try {
    button.click();
  } finally {
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
  }
}

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ModalPostFooter wizard navigation', () => {
  afterEach(() => {
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not submit when Next moves to the platforms step', async () => {
    const onSubmit = vi.fn();
    render(<WizardHarness onSubmit={onSubmit} />);

    clickLikeBrowser(
      screen.getByRole('button', { name: 'Next, select channels' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Schedule' }),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when Back returns to the setup step', async () => {
    const onSubmit = vi.fn();
    render(<WizardHarness onSubmit={onSubmit} />);

    clickLikeBrowser(
      screen.getByRole('button', { name: 'Next, select channels' }),
    );
    clickLikeBrowser(await screen.findByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('button', { name: 'Next, select channels' }),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits once when Publish is clicked on the platforms step', async () => {
    const onSubmit = vi.fn();
    render(<WizardHarness onSubmit={onSubmit} />);

    clickLikeBrowser(
      screen.getByRole('button', { name: 'Next, select channels' }),
    );
    clickLikeBrowser(await screen.findByRole('button', { name: 'Schedule' }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
