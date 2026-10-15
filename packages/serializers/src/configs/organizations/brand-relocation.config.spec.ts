import { BrandRelocationSerializer } from '@serializers/server/organizations/brand-relocation.serializer';

describe('BrandRelocationSerializer', () => {
  it('exposes the outcome without exposing the command payload or authority', () => {
    const document = BrandRelocationSerializer.serialize({
      id: 'move-1',
      brandId: 'brand-1',
      organizationId: 'source',
      destinationOrganizationId: 'destination',
      status: 'done',
      summary: { workflowsMoved: 1 },
      payload: {
        actor: { isSuperAdmin: true },
        updates: { text: 'private input' },
      },
      userId: 'actor',
    });
    expect(document.data).toMatchObject({
      id: 'move-1',
      type: 'brand-relocation',
      attributes: { status: 'done', summary: { workflowsMoved: 1 } },
    });
    const resource = document.data;
    if (!resource || Array.isArray(resource))
      throw new Error('Expected one relocation resource');
    expect(resource.attributes).not.toHaveProperty('payload');
    expect(resource.attributes).not.toHaveProperty('userId');
  });
});
