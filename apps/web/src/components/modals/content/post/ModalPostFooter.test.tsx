import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalPostFooter from '@/components/modals/content/post/ModalPostFooter';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useFormatter: () => ({
      dateTime: (value: Date, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('en-GB', options).format(value),
    }),
    useTranslations: translateFromCatalog,
  };
});

const baseProps = {
  channelCount: 3,
  isFormValid: true,
  isLoading: false,
  onClose: () => undefined,
  onSchedule: () => undefined,
  scheduledDate: new Date('2026-11-05T17:30:00.000Z'),
  scheduleTimezone: 'Europe/Paris',
};

describe('ModalPostFooter', () => {
  it('says how many channels get the post, and when', () => {
    render(<ModalPostFooter {...baseProps} />);

    expect(
      screen.getByText(/^3 channels · .*18:30.* Europe\/Paris$/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule 3' })).toBeEnabled();
  });

  it('asks for a time before it can schedule', () => {
    render(
      <ModalPostFooter
        {...baseProps}
        channelCount={1}
        isFormValid={false}
        scheduledDate={null}
      />,
    );

    expect(screen.getByText('1 channel · Pick a time')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule 1' })).toBeDisabled();
  });

  it('schedules only from its button, never by submitting the form', () => {
    const outcome = { scheduled: 0, submitted: 0 };

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          outcome.submitted += 1;
        }}
      >
        <ModalPostFooter
          {...baseProps}
          onSchedule={() => {
            outcome.scheduled += 1;
          }}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Schedule 3' }));

    expect(outcome).toEqual({ scheduled: 1, submitted: 0 });
  });
});
