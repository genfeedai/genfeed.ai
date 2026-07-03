import type { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateOrganizationModal } from './use-create-organization-modal';

const mockCreateOrganization = vi.fn();
const reloadMock = vi.fn();

function makeService() {
  return {
    createOrganization: mockCreateOrganization,
  } as unknown as OrganizationsService;
}

const getOrgsService = () => Promise.resolve(makeService());

describe('useCreateOrganizationModal', () => {
  beforeEach(() => {
    mockCreateOrganization.mockReset();
    mockCreateOrganization.mockResolvedValue({
      id: 'org_new',
      label: 'New Org',
    });
    reloadMock.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadMock },
      writable: true,
    });
  });

  it('starts closed with an empty form', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.label).toBe('');
    expect(result.current.description).toBe('');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.createError).toBeNull();
  });

  it('opens and edits the form fields', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.setLabel('Acme'));
    act(() => result.current.setDescription('Best org'));
    expect(result.current.label).toBe('Acme');
    expect(result.current.description).toBe('Best org');
  });

  it('resets the form when dismissed', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.open());
    act(() => result.current.setLabel('Acme'));
    act(() => result.current.setOpen(false));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.label).toBe('');
    expect(result.current.description).toBe('');
  });

  it('rejects an empty label without calling the service', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.createError).toBe('Organization name is required');
    expect(mockCreateOrganization).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('creates the organization with trimmed values and reloads', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setLabel('  Acme  '));
    act(() => result.current.setDescription('  Best org  '));

    await act(async () => {
      await result.current.submit();
    });

    expect(mockCreateOrganization).toHaveBeenCalledWith({
      description: 'Best org',
      label: 'Acme',
    });
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('omits an empty description on submit', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setLabel('Acme'));

    await act(async () => {
      await result.current.submit();
    });

    expect(mockCreateOrganization).toHaveBeenCalledWith({
      description: undefined,
      label: 'Acme',
    });
  });

  it('surfaces a create failure and clears the submitting flag', async () => {
    mockCreateOrganization.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setLabel('Acme'));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.createError).toBe('Failed to create organization');
    expect(result.current.isCreating).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
