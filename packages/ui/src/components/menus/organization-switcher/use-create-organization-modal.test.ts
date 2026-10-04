import {
  ORGANIZATION_NAME_REQUIRED_MESSAGE,
  ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
} from '@genfeedai/contracts/constants';
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

  it('starts closed with an empty, locked form and no visible errors', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.values).toEqual({
      description: '',
      label: '',
      websiteUrl: '',
    });
    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrors).toEqual({});
    expect(result.current.isCreating).toBe(false);
    expect(result.current.createError).toBeNull();
  });

  it('unlocks submit with a name alone', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.open());
    act(() => result.current.setField('label', 'Acme'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isValid).toBe(true);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('shows a clear error on a touched field and locks submit', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', 'Acme'));
    act(() => result.current.setField('websiteUrl', 'not a site'));

    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrors).toEqual({
      websiteUrl: ORGANIZATION_WEBSITE_FORMAT_MESSAGE,
    });

    act(() => result.current.setField('websiteUrl', 'acme.com'));
    expect(result.current.isValid).toBe(true);
    expect(result.current.fieldErrors).toEqual({});
  });

  it('flags a name that was cleared after typing', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', 'Acme'));
    act(() => result.current.setField('label', '   '));

    expect(result.current.fieldErrors.label).toBe(
      ORGANIZATION_NAME_REQUIRED_MESSAGE,
    );
  });

  it('resets the form when dismissed', () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.open());
    act(() => result.current.setField('label', 'Acme'));
    act(() => result.current.setOpen(false));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.values.label).toBe('');
    expect(result.current.fieldErrors).toEqual({});
  });

  it('reveals every error on submit without calling the service', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.fieldErrors.label).toBe(
      ORGANIZATION_NAME_REQUIRED_MESSAGE,
    );
    expect(mockCreateOrganization).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('creates the organization with trimmed values and reloads', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', '  Acme  '));
    act(() => result.current.setField('description', '  Best org  '));
    act(() => result.current.setField('websiteUrl', ' acme.com '));

    await act(async () => {
      await result.current.submit();
    });

    expect(mockCreateOrganization).toHaveBeenCalledWith({
      description: 'Best org',
      label: 'Acme',
      websiteUrl: 'acme.com',
    });
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('leaves blank optional fields out of the request', async () => {
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', 'Acme'));

    await act(async () => {
      await result.current.submit();
    });

    expect(mockCreateOrganization).toHaveBeenCalledWith({
      description: undefined,
      label: 'Acme',
      websiteUrl: undefined,
    });
  });

  it('surfaces a create failure and clears the submitting flag', async () => {
    mockCreateOrganization.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', 'Acme'));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.createError).toBe(
      'Could not create the organization. Try again.',
    );
    expect(result.current.isCreating).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('surfaces the server-provided error detail', async () => {
    mockCreateOrganization.mockRejectedValueOnce({
      response: {
        data: {
          errors: [
            {
              detail: 'Your plan allows 1 organization. Upgrade to Scale.',
              status: '422',
            },
          ],
        },
      },
    });
    const { result } = renderHook(() =>
      useCreateOrganizationModal(getOrgsService),
    );

    act(() => result.current.setField('label', 'Acme'));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.createError).toBe(
      'Your plan allows 1 organization. Upgrade to Scale.',
    );
    expect(result.current.isCreating).toBe(false);
  });
});
