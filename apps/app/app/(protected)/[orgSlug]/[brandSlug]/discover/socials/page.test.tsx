/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import DiscoverSocialsPage from './page';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pages/trends/list/trends-list', () => ({
  default: () => <div>Mocked socials overview</div>,
}));

describe('DiscoverSocialsPage', () => {
  it('renders the socials overview route', () => {
    render(<DiscoverSocialsPage />);

    expect(screen.getByText('Mocked socials overview')).toBeInTheDocument();
  });
});
