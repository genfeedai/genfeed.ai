import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileMediaCredit from './ProfileMediaCredit';

describe('ProfileMediaCredit', () => {
  it('credits the model and links to its catalog entry', () => {
    render(
      <ProfileMediaCredit
        mediaId="ing-1"
        modelKey="veo-3"
        modelLabel="Veo 3"
      />,
    );

    expect(screen.getByRole('link', { name: 'Veo 3' })).toHaveAttribute(
      'href',
      '/models#model-veo-3',
    );
    expect(screen.getByRole('link', { name: 'Make your own' })).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-up'),
    );
  });

  it('still offers "Make your own" when the model is not listed', () => {
    render(<ProfileMediaCredit mediaId="ing-1" modelKey="retired-model" />);

    expect(screen.queryByText(/Made with/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Make your own' }),
    ).toBeInTheDocument();
  });

  it('reports the asset to support by email', () => {
    render(<ProfileMediaCredit mediaId="ing-1" />);

    const href = screen
      .getByRole('link', { name: 'Report' })
      .getAttribute('href');
    expect(href).toBe(
      'mailto:support@genfeed.ai?body=I%20want%20to%20report%20this%20asset%20on%20genfeed.ai%20%28id%20ing-1%29.%20Reason%3A&subject=Report%20content%20on%20genfeed.ai',
    );
  });
});
