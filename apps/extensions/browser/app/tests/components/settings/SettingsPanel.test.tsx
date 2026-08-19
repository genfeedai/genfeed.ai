import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~components/settings/AutoFillToggle', () => ({
  AutoFillToggle: () =>
    React.createElement('div', null, 'Auto-fill compose box'),
}));

vi.mock('~components/settings/BrandSelector', () => ({
  BrandSelector: () => React.createElement('div', null, 'Brand selector'),
}));

vi.mock('~components/settings/ConnectedAccounts', () => ({
  ConnectedAccounts: () =>
    React.createElement('div', null, 'Connected accounts'),
}));

vi.mock('~components/settings/ThemeSelector', () => ({
  ThemeSelector: () => React.createElement('div', null, 'Appearance selector'),
}));

import { SettingsPanel } from '~components/settings/SettingsPanel';
import { useSettingsStore } from '~store/use-settings-store';

describe('SettingsPanel', () => {
  beforeEach(() => {
    useSettingsStore.setState({ isLoaded: true });
  });

  it('does not render unavailable auto-post controls', () => {
    render(React.createElement(SettingsPanel));

    expect(screen.getByText('Auto-fill compose box')).toBeInTheDocument();
    expect(screen.queryByText('Auto-post content')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
    expect(screen.getByText('Appearance selector')).toBeInTheDocument();
  });

  it('does not expose mutable preferences before storage hydration', () => {
    useSettingsStore.setState({ isLoaded: false });

    render(React.createElement(SettingsPanel));

    expect(screen.getByText('Loading preferences…')).toBeInTheDocument();
    expect(screen.queryByText('Auto-fill compose box')).not.toBeInTheDocument();
    expect(screen.queryByText('Appearance selector')).not.toBeInTheDocument();
  });
});
