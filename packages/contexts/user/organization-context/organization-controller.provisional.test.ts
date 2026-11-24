import { ROUTED_ORGANIZATION_STORAGE_KEY } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  type MembershipService,
  OrganizationController,
  type OrganizationControllerPorts,
  type OrganizationReconciliationInputs,
  type RoutedOrganizationSummary,
} from './organization-controller';

type Device = {
  cacheClears: number;
  caches: number;
  /** Runs when the device starts forgetting the copy. */
  onWipeStart?: () => void;
  wipeFails: boolean;
  wipes: number;
};

function newDevice(overrides: Partial<Device> = {}): Device {
  return {
    cacheClears: 0,
    caches: 2,
    wipeFails: false,
    wipes: 0,
    ...overrides,
  };
}

function summary(
  id: string,
  slug: string,
  isActive: boolean,
): RoutedOrganizationSummary {
  return { brand: null, id, isActive, label: id, slug };
}

function build(device: Device, organizations: RoutedOrganizationSummary[]) {
  const ports: OrganizationControllerPorts = {
    broadcastChange: () => undefined,
    clearTenantCaches: async () => {
      device.cacheClears += 1;
      device.caches = 0;
    },
    navigate: () => undefined,
    reportMismatch: () => undefined,
    setProvisionalOrganization: () => undefined,
    setRequestOrganizationId: () => undefined,
    wipeDeviceStores: async () => {
      device.onWipeStart?.();
      // The device takes a moment to forget the copy.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (device.wipeFails) throw new Error('storage unavailable');
      device.wipes += 1;
    },
  };
  const service: MembershipService = {
    getMyOrganizations: async () => organizations,
    switchOrganization: async () => ({}),
  };
  const controller = new OrganizationController(ports);
  const inputs = (
    overrides: Partial<OrganizationReconciliationInputs> = {},
  ): OrganizationReconciliationInputs => ({
    bypass: false,
    getMembershipService: async () => service,
    isLoaded: true,
    isSignedIn: true,
    provisional: { organizationId: 'org-a', userId: 'user-1' },
    routeSlug: 'a',
    sessionKey: 'user-1:session',
    ...overrides,
  });
  controller.setLatest({
    getMembershipService: async () => service,
    pathname: '/a/overview',
    routeSlug: 'a',
  });
  return { controller, inputs };
}

describe('OrganizationController provisional exits', () => {
  it('wipes the copy when the session answers signed out', async () => {
    const device = newDevice();
    const { controller, inputs } = build(device, [summary('org-a', 'a', true)]);

    controller.restart(inputs({ isLoaded: false, isSignedIn: false }));
    expect(controller.getState().provisionalOrganizationId).toBe('org-a');
    controller.restart(inputs({ isLoaded: true, isSignedIn: false }));

    await vi.waitFor(() => expect(device.wipes).toBe(1));
    expect(controller.getState().provisionalOrganizationId).toBeNull();
    expect(device.caches).toBe(0);
  });

  it('does not confirm another organization behind the slug before the copy is gone', async () => {
    const device = newDevice();
    const { controller, inputs } = build(device, [summary('org-b', 'a', true)]);
    let wipesAtMatch = -1;
    controller.subscribe(() => {
      if (controller.getState().status === 'matched' && wipesAtMatch < 0) {
        wipesAtMatch = device.wipes;
      }
    });

    controller.restart(inputs());

    await vi.waitFor(() =>
      expect(controller.getState().status).toBe('matched'),
    );
    expect(controller.getState().confirmedOrganizationId).toBe('org-b');
    expect(wipesAtMatch).toBe(1);
  });

  it('leaves the gate alone when the provider unmounts during the wipe', async () => {
    const device = newDevice();
    const { controller, inputs } = build(device, [summary('org-b', 'a', true)]);
    device.onWipeStart = () => controller.dispose();

    controller.restart(inputs());

    await vi.waitFor(() => expect(device.wipes).toBe(1));
    // One clear for the refused copy; the unmounted provider clears nothing more.
    await vi.waitFor(() => expect(device.cacheClears).toBe(1));
    expect(controller.getState().status).not.toBe('matched');
  });

  it('keeps a failed wipe owed and pays it before the retry confirms anything', async () => {
    const device = newDevice({ wipeFails: true });
    const { controller, inputs } = build(device, []);

    controller.restart(inputs());

    await vi.waitFor(() => expect(controller.getState().status).toBe('failed'));
    expect(device.wipes).toBe(0);

    device.wipeFails = false;
    controller.retry();

    await vi.waitFor(() =>
      expect(controller.getState().status).toBe('unauthorized'),
    );
    expect(device.wipes).toBe(1);
  });

  it('pays a failed wipe before another tab’s confirmation', async () => {
    const device = newDevice({ wipeFails: true });
    const organizations: RoutedOrganizationSummary[] = [];
    const { controller, inputs } = build(device, organizations);

    controller.restart(inputs());
    await vi.waitFor(() => expect(controller.getState().status).toBe('failed'));

    // The member is back, and the device can forget the copy now.
    device.wipeFails = false;
    organizations.push(summary('org-a', 'a', true));
    let wipesAtMatch = -1;
    controller.subscribe(() => {
      if (controller.getState().status === 'matched' && wipesAtMatch < 0) {
        wipesAtMatch = device.wipes;
      }
    });
    controller.handleStorageChange({
      key: ROUTED_ORGANIZATION_STORAGE_KEY,
      newValue: 'changed',
    });

    await vi.waitFor(() =>
      expect(controller.getState().status).toBe('matched'),
    );
    expect(wipesAtMatch).toBe(1);
  });

  it('wipes nothing when the check only fails', async () => {
    const device = newDevice();
    const { controller, inputs } = build(device, []);
    const failing = {
      getMyOrganizations: async () => {
        throw Object.assign(new Error('offline'), { isNetworkError: true });
      },
      switchOrganization: async () => ({}),
    } satisfies MembershipService;

    controller.restart(inputs({ getMembershipService: async () => failing }));

    await vi.waitFor(() => expect(controller.getState().status).toBe('failed'));
    expect(device.wipes).toBe(0);
    expect(device.caches).toBe(2);
  });
});
