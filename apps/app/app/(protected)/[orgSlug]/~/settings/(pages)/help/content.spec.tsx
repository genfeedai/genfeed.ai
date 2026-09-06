import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SettingsHelpPage from './content';

describe('Help navigation', () => {
  it('opens About inside the app and keeps external release notes external', () => {
    render(<SettingsHelpPage />);
    const about = screen.getByRole('link', { name: 'About Genfeed' });
    expect(about.getAttribute('href')).toBe('/settings/about');
    expect(about.getAttribute('target')).toBeNull();
    const changelog = screen.getByRole('link', { name: 'Changelog' });
    expect(changelog.getAttribute('href')).toBe('https://genfeed.ai/changelog');
    expect(changelog.getAttribute('target')).toBe('_blank');
  });
});
