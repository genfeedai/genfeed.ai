/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import ResearchSocialsPage from './page';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pages/trends/list/trends-list', () => ({
  default: () => <div>Mocked socials overview</div>,
}));

describe('ResearchSocialsPage', () => {
  it('renders the socials overview route', () => {
    render(<ResearchSocialsPage />);

    expect(screen.getByText('Mocked socials overview')).toBeInTheDocument();
  });
});
