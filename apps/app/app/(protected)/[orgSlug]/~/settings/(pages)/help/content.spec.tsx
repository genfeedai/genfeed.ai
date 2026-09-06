import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SettingsHelpPage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('pages.about');
  return { useTranslations: () => translate };
});

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
