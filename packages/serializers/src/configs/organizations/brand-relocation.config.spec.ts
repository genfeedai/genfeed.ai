import { BrandRelocationSerializer } from '@serializers/server/organizations/brand-relocation.serializer';

describe('BrandRelocationSerializer', () => {
  it('exposes the outcome without exposing the command payload or authority', () => {
    const document = new BrandRelocationSerializer().serialize({
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
    expect(document.data.attributes).not.toHaveProperty('payload');
    expect(document.data.attributes).not.toHaveProperty('userId');
  });
});
