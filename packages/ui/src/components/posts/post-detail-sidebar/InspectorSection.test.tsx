import { fireEvent, render, screen } from '@testing-library/react';
import InspectorSection from '@ui/posts/post-detail-sidebar/InspectorSection';
import { describe, expect, it } from 'vitest';

describe('InspectorSection', () => {
  it('renders the title and summary in the header and starts collapsed', () => {
    render(
      <InspectorSection title="Lineage" summary="Approved">
        <p>Body</p>
      </InspectorSection>,
    );

    const header = screen.getByRole('button', { name: 'Lineage Approved' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });

  it('toggles its body from the header', () => {
    render(
      <InspectorSection title="Checks" isDefaultOpen>
        <p>Body</p>
      </InspectorSection>,
    );

    expect(screen.getByText('Body')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Checks' }));

    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });

  it('keeps the body mounted while collapsed when asked', () => {
    render(
      <InspectorSection title="TikTok settings" isMountedWhenClosed>
        <p>Body</p>
      </InspectorSection>,
    );

    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Body')).not.toBeVisible();
  });
});
