import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import type { IHttpRequestOptions } from '@genfeedai/contracts/interfaces/utils/http-request-options.interface';
import {
  clearRequestOrganizationId,
  HTTPBaseService,
  requestOrganizationGate,
  whenRequestOrganizationSettled,
} from '@services/core/interceptor.service';
import type {
  AxiosAdapter,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/generation-entry-headers', () => ({
  getGenerationEntryHeaders: vi.fn(() => ({})),
}));

/** What reached the API: the headers of each request the adapter was given. */
const sent: Array<Record<string, unknown>> = [];

const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  sent.push({ ...(config.headers.toJSON() as Record<string, unknown>) });
  return {
    config,
    data: {},
    headers: {},
    status: 200,
    statusText: 'OK',
  };
};

class TenantService extends HTTPBaseService {
  constructor() {
    super('https://api.test/v1', 'token');
    this.instance.defaults.adapter = adapter;
  }

  read(config?: AxiosRequestConfig & IHttpRequestOptions) {
    return this.instance.get('/things', config);
  }
}

class PublicLikeService extends HTTPBaseService {
  constructor() {
    super('https://api.test/v1/public', '');
    this.instance.defaults.adapter = adapter;
  }

  protected override isOrganizationGateExempt(): boolean {
    return true;
  }

  read() {
    return this.instance.get('/flags');
  }
}

class ProbeService extends TenantService {
  headersWhenSettled() {
    return this.requestOrganizationHeaders();
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function track<T>(promise: Promise<T>): {
  outcome: () => Promise<'pending' | 'answered' | 'cancelled'>;
} {
  let state: 'pending' | 'answered' | 'cancelled' = 'pending';
  promise.then(
    () => {
      state = 'answered';
    },
    (error: { isCancelled?: boolean }) => {
      state = error.isCancelled === true ? 'cancelled' : 'pending';
    },
  );
  return {
    outcome: async () => {
      await flush();
      return state;
    },
  };
}

describe('the API client while the organization is provisional', () => {
  afterEach(() => {
    clearRequestOrganizationId();
    sent.length = 0;
  });

  it('sends a request as before when the organization is confirmed or not routed', async () => {
    await new TenantService().read();
    requestOrganizationGate.setConfirmed('org-a');
    await new TenantService().read();

    expect(sent.map((headers) => headers[ORGANIZATION_CONTEXT_HEADER])).toEqual(
      [undefined, 'org-a'],
    );
  });

  it('does not send a request until the same organization is confirmed, then sends it once with the header', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const request = track(new TenantService().read());

    expect(await request.outcome()).toBe('pending');
    expect(sent).toEqual([]);

    requestOrganizationGate.setConfirmed('org-a');

    expect(await request.outcome()).toBe('answered');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[ORGANIZATION_CONTEXT_HEADER]).toBe('org-a');
  });

  it.each([
    [
      'another organization is confirmed',
      () => requestOrganizationGate.setConfirmed('org-b'),
    ],
    [
      'the check is refused or fails',
      () => requestOrganizationGate.setUnscoped(),
    ],
  ])('never sends a held request when %s', async (_name, change) => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const request = track(new TenantService().read());
    await flush();

    change();

    expect(await request.outcome()).toBe('cancelled');
    expect(sent).toEqual([]);
  });

  it('lets the membership check leave at once, without an organization header', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');

    await new TenantService().read({ exemptFromOrganizationGate: true });

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty(ORGANIZATION_CONTEXT_HEADER);
  });

  it('lets a service with no organization leave at once', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');

    await new PublicLikeService().read();

    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty(ORGANIZATION_CONTEXT_HEADER);
  });

  it('ends the wait of a request that is cancelled, and never sends it', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const service = new TenantService();
    const request = track(service.read());
    await flush();

    service.cancelPendingRequests();
    requestOrganizationGate.setConfirmed('org-a');

    expect(await request.outcome()).toBe('cancelled');
    expect(sent).toEqual([]);
  });

  it('ends the wait of a request whose caller aborts it', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const controller = new AbortController();
    const request = track(
      new TenantService().read({ signal: controller.signal }),
    );
    await flush();

    controller.abort();
    requestOrganizationGate.setConfirmed('org-a');

    expect(await request.outcome()).toBe('cancelled');
    expect(sent).toEqual([]);
  });

  it('holds the headers of a direct request the same way', async () => {
    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const direct = whenRequestOrganizationSettled();
    const subclass = new ProbeService().headersWhenSettled();

    requestOrganizationGate.setConfirmed('org-a');

    await expect(direct).resolves.toEqual({
      [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
    });
    await expect(subclass).resolves.toEqual({
      [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
    });
  });

  it('refuses a service bound to an organization that is no longer the confirmed one', async () => {
    requestOrganizationGate.setConfirmed('org-a');
    const service = new TenantService();
    (
      service as unknown as { bindRequestOrganization(id: string): void }
    ).bindRequestOrganization('org-a');

    requestOrganizationGate.setProvisional('org-a', 'user-1');
    const request = track(service.read());
    requestOrganizationGate.setConfirmed('org-a');

    // Provisional in between ended the confirmation the binding was made under.
    expect(await request.outcome()).toBe('cancelled');
    expect(sent).toEqual([]);
  });
});
