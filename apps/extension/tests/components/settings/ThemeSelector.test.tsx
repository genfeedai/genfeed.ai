import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSetTheme, mockUseSettingsStore } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseSettingsStore: vi.fn(),
}));

vi.mock('~store/use-settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector(mockUseSettingsStore()),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { onClick: () => onValueChange('dark'), type: 'button' },
        `Current: ${value}`,
      ),
      children,
    ),
  SelectContent: ({ children }: { children: ReactNode }) =>
    React.createElement('div', null, children),
  SelectItem: ({ children }: { children: ReactNode }) =>
    React.createElement('span', null, children),
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) =>
    React.createElement('div', props, children),
  SelectValue: () => React.createElement('span', null, 'Selected theme'),
}));

import { ThemeSelector } from '~components/settings/ThemeSelector';

describe('ThemeSelector', () => {
  beforeEach(() => {
    mockSetTheme.mockReset();
    mockUseSettingsStore.mockReturnValue({
      setTheme: mockSetTheme,
      theme: 'system',
    });
  });

  it('offers an accessible system, light, and dark appearance preference', () => {
    render(React.createElement(ThemeSelector));

    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByLabelText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Current: system'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
