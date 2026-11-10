import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SupportCreatorButton from './SupportCreatorButton';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

describe('SupportCreatorButton', () => {
  it('opens the app support page for the creator', () => {
    render(<SupportCreatorButton handle="ada" />);

    expect(screen.getByRole('link', { name: 'Support @ada' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/support/ada',
    );
  });

  it('carries the article the reader came from', () => {
    render(<SupportCreatorButton articleId="article-1" handle="ada" />);

    expect(screen.getByRole('link', { name: 'Support @ada' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/support/ada?article=article-1',
    );
  });
});
