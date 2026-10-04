import {
  buildGuardedDelegate,
  type GuardedRow,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

function receiptRow(
  id: string,
  receiptId: string,
  organizationId: string | null,
): GuardedRow {
  return {
    data: {},
    expiresAt: null,
    id,
    isDeleted: false,
    organizationId,
    receiptId,
    status: 'completed',
  };
}

function setup() {
  const receipts = [
    receiptRow('unclaimed', 'bearer-unclaimed', null),
    receiptRow('mine', 'bearer-mine', ORG),
    receiptRow('theirs', 'bearer-theirs', OTHER_ORG),
  ];
  const prisma = {
    skillReceipt: buildGuardedDelegate('SkillReceipt', receipts),
  };
  const service = new SkillDownloadService(
    {} as never,
    { log: vi.fn() } as never,
    {} as never,
    {} as never,
    prisma as never,
    {} as never,
  );
  // The claim is private: it is the one place the receipt hatch is exercised.
  const privateService = service as unknown as {
    findOrClaimCompletedReceipt: (
      organizationId: string,
      receiptId: string,
    ) => Promise<GuardedRow | null>;
  };
  const claimReceipt = (organizationId: string, receiptId: string) =>
    privateService.findOrClaimCompletedReceipt(organizationId, receiptId);
  const claim = (receiptId: string) =>
    runWithTenantContext({ organizationId: ORG }, () =>
      claimReceipt(ORG, receiptId),
    );

  return { claim, receipts };
}

describe('skills-pro receipts under the CLOUD tenant guard', () => {
  it('claims an organization-less bearer receipt for the authenticated organization', async () => {
    const { claim, receipts } = setup();

    const receipt = await claim('bearer-unclaimed');

    expect(receipt?.organizationId).toBe(ORG);
    expect(receipts.find((row) => row.id === 'unclaimed')?.organizationId).toBe(
      ORG,
    );
  });

  it('returns the receipt the organization already owns', async () => {
    const { claim } = setup();

    await expect(claim('bearer-mine')).resolves.toMatchObject({ id: 'mine' });
  });

  it('refuses a receipt owned by another organization', async () => {
    const { claim, receipts } = setup();

    await expect(claim('bearer-theirs')).resolves.toBeNull();
    expect(receipts.find((row) => row.id === 'theirs')?.organizationId).toBe(
      OTHER_ORG,
    );
  });
});
