import { VideoReferenceUrlService } from '@api/collections/videos/services/video-reference-url.service';
import { testId } from '@helpers/testing/test-id.helper';

const organizationId = testId('org', 40);
const referenceId = testId('reference', 40);

function setup() {
  const issueServerPublish = vi.fn(
    async (_organizationId: string, ids: readonly string[]) =>
      new Map(ids.map((id) => [id, `https://signed.test/${id}`])),
  );
  const ingredientsService = {
    findOne: vi.fn().mockResolvedValue({ id: referenceId }),
  };
  const service = new VideoReferenceUrlService(
    { findOne: vi.fn() } as never,
    { isAuthorizedMediaDeliveryEnabled: true } as never,
    ingredientsService as never,
    { warn: vi.fn() } as never,
    { issueServerAssetUrls: vi.fn(), issueServerPublish } as never,
  );
  return { issueServerPublish, service };
}

describe('VideoReferenceUrlService', () => {
  it('resolves one reference through the authorized issuer', async () => {
    const { issueServerPublish, service } = setup();
    await expect(
      service.resolveUrl({ organizationId, referenceId }),
    ).resolves.toBe(`https://signed.test/${referenceId}`);
    expect(issueServerPublish).toHaveBeenCalledWith(organizationId, [
      referenceId,
    ]);
  });

  it('resolves a list of references through the authorized issuer', async () => {
    const { service } = setup();
    await expect(
      service.resolveUrls({ organizationId, referenceIds: [referenceId] }),
    ).resolves.toEqual([`https://signed.test/${referenceId}`]);
  });
});
