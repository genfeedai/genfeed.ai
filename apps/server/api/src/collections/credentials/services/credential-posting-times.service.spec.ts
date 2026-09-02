import { PostStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialPostingTimesService } from './credential-posting-times.service';

const ORG_ID = 'org-1';
const CREDENTIAL_ID = 'cred-1';
const BRAND_ID = 'brand-1';

describe('CredentialPostingTimesService', () => {
  const credentialFindFirst = vi.fn();
  const credentialUpdateMany = vi.fn();
  const brandFindFirst = vi.fn();
  const postFindMany = vi.fn();
  let service: CredentialPostingTimesService;

  beforeEach(() => {
    vi.clearAllMocks();
    credentialFindFirst.mockResolvedValue({
      brandId: BRAND_ID,
      id: CREDENTIAL_ID,
      postingTimes: [{ hour: 9, minute: 0 }],
    });
    credentialUpdateMany.mockResolvedValue({ count: 1 });
    brandFindFirst.mockResolvedValue({
      agentConfig: { schedule: { timezone: 'UTC' } },
    });
    postFindMany.mockResolvedValue([]);
    service = new CredentialPostingTimesService({
      brand: { findFirst: brandFindFirst },
      credential: {
        findFirst: credentialFindFirst,
        updateMany: credentialUpdateMany,
      },
      post: { findMany: postFindMany },
    } as never);
  });

  it('lists normalized times for a tenant-scoped credential', async () => {
    await expect(service.list(ORG_ID, CREDENTIAL_ID)).resolves.toEqual([
      { hour: 9, minute: 0 },
    ]);
    expect(credentialFindFirst).toHaveBeenCalledWith({
      select: {
        brandId: true,
        id: true,
        postingTimes: true,
      },
      where: {
        id: CREDENTIAL_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });

  it('rejects a credential from another tenant', async () => {
    credentialFindFirst.mockResolvedValueOnce(null);
    await expect(service.list('org-other', CREDENTIAL_ID)).rejects.toThrow(
      "Credential with identifier 'cred-1' not found",
    );
    expect(credentialUpdateMany).not.toHaveBeenCalled();
  });

  it('adds a posting time and persists the sorted unique list', async () => {
    await expect(
      service.add(ORG_ID, CREDENTIAL_ID, { hour: 18, minute: 0 }),
    ).resolves.toEqual([
      { hour: 9, minute: 0 },
      { hour: 18, minute: 0 },
    ]);
    expect(credentialUpdateMany).toHaveBeenCalledWith({
      data: {
        postingTimes: [
          { hour: 9, minute: 0 },
          { hour: 18, minute: 0 },
        ],
      },
      where: {
        id: CREDENTIAL_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });

  it('removes a posting time so it is no longer used', async () => {
    await expect(
      service.remove(ORG_ID, CREDENTIAL_ID, { hour: 9, minute: 0 }),
    ).resolves.toEqual([]);
    expect(credentialUpdateMany).toHaveBeenCalledWith({
      data: { postingTimes: [] },
      where: {
        id: CREDENTIAL_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });

  it('returns not-found for find-next-slot when the list is empty', async () => {
    credentialFindFirst.mockResolvedValueOnce({
      brandId: BRAND_ID,
      id: CREDENTIAL_ID,
      postingTimes: [],
    });

    await expect(
      service.findNextSlot(ORG_ID, CREDENTIAL_ID, '2026-08-24T08:00:00.000Z'),
    ).resolves.toEqual({ found: false });
    expect(postFindMany).not.toHaveBeenCalled();
  });

  it('returns the later preferred time after the earlier one is occupied', async () => {
    credentialFindFirst.mockResolvedValueOnce({
      brandId: BRAND_ID,
      id: CREDENTIAL_ID,
      postingTimes: [
        { hour: 9, minute: 0 },
        { hour: 18, minute: 0 },
      ],
    });
    postFindMany.mockResolvedValueOnce([
      {
        publishedAt: null,
        scheduledDate: new Date('2026-08-24T09:00:00.000Z'),
      },
    ]);

    await expect(
      service.findNextSlot(ORG_ID, CREDENTIAL_ID, '2026-08-24T08:00:00.000Z'),
    ).resolves.toEqual({
      found: true,
      hour: 18,
      instant: '2026-08-24T18:00:00.000Z',
      minute: 0,
      timezone: 'UTC',
    });
    expect(postFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: BRAND_ID,
          credentialId: CREDENTIAL_ID,
          isDeleted: false,
          organizationId: ORG_ID,
          status: {
            in: [
              PostStatus.DRAFT,
              PostStatus.PENDING,
              PostStatus.PRIVATE,
              PostStatus.PROCESSING,
              PostStatus.PUBLIC,
              PostStatus.SCHEDULED,
              PostStatus.UNLISTED,
            ],
          },
        }),
      }),
    );
  });

  it('resolves find-next-slot in the brand timezone', async () => {
    credentialFindFirst.mockResolvedValueOnce({
      brandId: BRAND_ID,
      id: CREDENTIAL_ID,
      postingTimes: [{ hour: 9, minute: 0 }],
    });
    brandFindFirst.mockResolvedValueOnce({
      agentConfig: { schedule: { timezone: 'Europe/Malta' } },
    });

    const slot = await service.findNextSlot(
      ORG_ID,
      CREDENTIAL_ID,
      '2026-08-24T06:00:00.000Z',
    );

    expect(slot.found).toBe(true);
    if (!slot.found) {
      return;
    }
    expect(slot.timezone).toBe('Europe/Malta');
    expect(slot.hour).toBe(9);
    expect(brandFindFirst).toHaveBeenCalledWith({
      select: { agentConfig: true },
      where: {
        id: BRAND_ID,
        isDeleted: false,
        organizationId: ORG_ID,
      },
    });
  });
});
