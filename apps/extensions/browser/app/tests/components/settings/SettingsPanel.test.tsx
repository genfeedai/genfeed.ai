import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

import { SettingsPanel } from '~components/settings/SettingsPanel';

describe('SettingsPanel', () => {
  it('does not render unavailable auto-post controls', () => {
    render(React.createElement(SettingsPanel));

    expect(screen.getByText('Auto-fill compose box')).toBeInTheDocument();
    expect(screen.queryByText('Auto-post content')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });
});
