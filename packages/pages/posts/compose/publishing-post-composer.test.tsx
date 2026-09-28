import '@testing-library/jest-dom/vitest';
import { Platform, TargetExecutionState } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import PublishingPostComposer from './publishing-post-composer';

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    credentials: [
      {
        externalHandle: 'acme',
        id: 'cred-1',
        label: 'Acme X',
        platform: Platform.TWITTER,
      },
    ],
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () => Promise.resolve({ post: mocks.createPost }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('platform=twitter'),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/modals/content/post/PostDraftGenerator', () => ({
  default: () => <div>draft generator</div>,
}));

vi.mock('@ui/previews/TargetPreview', () => ({
  default: () => <div data-testid="composer-preview">preview</div>,
}));

// SelectField renders through Radix Select, which needs pointer-capture APIs
// jsdom does not implement. Swap it for a native <select> wired to the same
// react-hook-form `control`/`onChange` contract so the composer's own
// clear-account logic still runs against real form state.
vi.mock('@ui/primitives/select', () => ({
  SelectField: ({
    children,
    control,
    name,
    onChange,
  }: {
    children: ReactNode;
    control: Control<FieldValues>;
    name: Path<FieldValues>;
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  }) => {
    const { field } = useController({ control, name });
    return (
      <select
        aria-label={name}
        onChange={(event) => {
          field.onChange(event.target.value);
          onChange?.(event);
        }}
        value={typeof field.value === 'string' ? field.value : ''}
      >
        {children}
      </select>
    );
  },
}));

// FormDateTimePicker owns its own calendar popover; stub it down to a single
// control that reports a fixed date, matching how other composer tests avoid
// the underlying calendar widget.
vi.mock('@ui/primitives/date-time-picker', () => ({
  default: ({ onChange }: { onChange: (date: Date | null) => void }) => (
    <button
      onClick={() => onChange(new Date('2026-10-01T10:00:00.000Z'))}
      type="button"
    >
      pick scheduled date
    </button>
  ),
}));

describe('PublishingPostComposer', () => {
  it('renders the compose form beside a live preview', () => {
    render(<PublishingPostComposer />);

    expect(
      screen.getByRole('heading', { name: 'New post' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('composer-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create post' })).toBeDisabled();
  });

  it('lets a scheduled draft be saved after the account is cleared', async () => {
    render(<PublishingPostComposer />);

    fireEvent.change(screen.getByPlaceholderText('Write the post'), {
      target: { value: 'Launch update' },
    });

    fireEvent.change(screen.getByLabelText('credentialId'), {
      target: { value: 'cred-1' },
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'pick scheduled date' }),
    );

    // Clearing the account should retract the scheduled date field...
    fireEvent.change(screen.getByLabelText('credentialId'), {
      target: { value: '' },
    });
    expect(
      screen.queryByRole('button', { name: 'pick scheduled date' }),
    ).not.toBeInTheDocument();

    // ...and the draft must still be saveable, not silently rejected by
    // leftover SCHEDULED state with no connected account.
    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => expect(mocks.createPost).toHaveBeenCalled());
    const [payload] = mocks.createPost.mock.calls.at(-1) ?? [];
    expect(payload).toEqual(
      expect.objectContaining({
        credentialId: undefined,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    expect(payload).not.toHaveProperty('scheduledDate');
  });
});
