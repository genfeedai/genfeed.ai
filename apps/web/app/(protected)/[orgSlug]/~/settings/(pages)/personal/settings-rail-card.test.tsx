// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsRailCard from './settings-rail-card';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const state = vi.hoisted(() => ({
  isLoaded: true,
  resetRail: vi.fn(),
}));

vi.mock('@/components/shell/rail-preferences.provider', () => ({
  useRailPreferencesContext: () => ({
    isLoaded: state.isLoaded,
    resetRail: state.resetRail,
  }),
}));

describe('SettingsRailCard', () => {
  beforeEach(() => {
    state.isLoaded = true;
    state.resetRail.mockReset();
  });

  it('resets the rail to its default', () => {
    render(<SettingsRailCard />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset rail to default' }),
    );

    expect(state.resetRail).toHaveBeenCalledTimes(1);
  });

  it('waits for saved preferences before resetting', () => {
    state.isLoaded = false;
    render(<SettingsRailCard />);

    expect(
      screen.getByRole('button', { name: 'Reset rail to default' }),
    ).toBeDisabled();
  });
});
