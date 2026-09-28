import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingSection from './BookingSection';

const capture = vi.hoisted(() => vi.fn());

vi.mock('../../analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: capture,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    calendly: 'https://calendly.com/vincent-genfeed/30min',
  },
}));

function postFrom(origin: string, event: string): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: { event }, origin }),
  );
}

describe('BookingSection', () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it('embeds the calendar at the #book anchor with a new-tab fallback', () => {
    const { container } = render(<BookingSection />);

    expect(container.querySelector('section#book')).not.toBeNull();
    const frame = screen.getByTitle('Book a call with Genfeed');
    expect(frame.getAttribute('src')).toContain(
      'https://calendly.com/vincent-genfeed/30min?embed_domain=genfeed.ai',
    );
    expect(
      screen.getByRole('link', { name: 'Open it in a new tab' }),
    ).toHaveAttribute('href', 'https://calendly.com/vincent-genfeed/30min');
  });

  it('counts a confirmed booking from Calendly, and nothing else', () => {
    render(<BookingSection />);

    postFrom('https://calendly.com', 'calendly.page_height');
    postFrom('https://evil.example', 'calendly.event_scheduled');
    expect(capture).not.toHaveBeenCalled();

    postFrom('https://calendly.com', 'calendly.event_scheduled');
    expect(capture).toHaveBeenCalledWith('call_booked', {
      surface: 'done_for_you',
    });
  });

  it('stops listening once it unmounts', () => {
    const { unmount } = render(<BookingSection />);
    unmount();

    postFrom('https://calendly.com', 'calendly.event_scheduled');
    expect(capture).not.toHaveBeenCalled();
  });
});
