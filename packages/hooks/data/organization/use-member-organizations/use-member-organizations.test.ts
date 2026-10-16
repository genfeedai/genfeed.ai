import {
  sortMemberOrganizations,
  useMemberOrganizations,
} from '@hooks/data/organization/use-member-organizations/use-member-organizations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getAllOrganizations: vi.fn(),
  getMyOrganizations: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => service,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useMemberOrganizations', () => {
  it('lists only member organizations, alphabetically', async () => {
    service.getMyOrganizations.mockResolvedValue([
      {
        brand: null,
        id: 'b',
        isActive: true,
        isOwner: true,
        label: 'shipshitshow',
        slug: 'b',
      },
      {
        brand: null,
        id: 'a',
        isActive: false,
        isOwner: false,
        label: 'Genfeed',
        slug: 'a',
      },
      {
        brand: null,
        id: 'c',
        isActive: false,
        isOwner: true,
        label: 'acme',
        slug: 'c',
      },
    ]);

    const { result } = renderHook(() => useMemberOrganizations(), { wrapper });

    await waitFor(() => expect(result.current.organizations).toHaveLength(3));
    expect(result.current.organizations.map((org) => org.label)).toEqual([
      'acme',
      'Genfeed',
      'shipshitshow',
    ]);
    expect(service.getAllOrganizations).not.toHaveBeenCalled();
  });

  it('sorts case-insensitively without mutating the input', () => {
    const input = [
      { id: '2', label: 'beta' },
      { id: '1', label: 'Alpha' },
    ];
    expect(sortMemberOrganizations(input).map((org) => org.id)).toEqual([
      '1',
      '2',
    ]);
    expect(input[0].id).toBe('2');
  });
});
