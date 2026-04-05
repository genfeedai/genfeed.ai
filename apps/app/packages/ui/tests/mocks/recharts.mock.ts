/**
 * Opt-in recharts mock for chart/analytics tests.
 * Import this file at the top of test files that render recharts components:
 *
 *   import '../../tests/mocks/recharts.mock';
 *
 * This replaces the previous global mock in setup.ts, avoiding TDZ conflicts
 * when tests also call vi.mock('recharts', ...) locally.
 */
import * as React from 'react';
import { vi } from 'vitest';

vi.mock('recharts', () => ({
  Area: () => React.createElement('div', { 'data-testid': 'area' }),
  AreaChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'area-chart' }, children),
  Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
  BarChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  CartesianGrid: () =>
    React.createElement('div', { 'data-testid': 'cartesian-grid' }),
  Cell: () => React.createElement('div', { 'data-testid': 'cell' }),
  Legend: () => React.createElement('div', { 'data-testid': 'legend' }),
  Line: () => React.createElement('div', { 'data-testid': 'line' }),
  LineChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, children),
  Pie: () => React.createElement('div', { 'data-testid': 'pie' }),
  PieChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      'div',
      { 'data-testid': 'responsive-container' },
      children,
    ),
  Tooltip: () => React.createElement('div', { 'data-testid': 'tooltip' }),
  XAxis: () => React.createElement('div', { 'data-testid': 'x-axis' }),
  YAxis: () => React.createElement('div', { 'data-testid': 'y-axis' }),
}));
