import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStrategiesController } from './agent-strategies.controller';

describe('AgentStrategiesController', () => {
  it('scopes a brand-filtered roster to both organization and brand', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const query = controller.buildFindAllQuery(
      { organizationId: 'org-1' } as AuthenticatedUser,
      {
        brandId: 'brand-1',
        isDeleted: false,
        limit: 10,
        page: 1,
        sort: 'createdAt: -1',
      },
    );

    expect(query.where).toMatchObject({
      brandId: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('fails closed when the authenticated organization is missing', () => {
    const controller = new AgentStrategiesController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      controller.buildFindAllQuery({} as AuthenticatedUser, {
        brandId: 'brand-1',
        isDeleted: false,
        limit: 10,
        page: 1,
        sort: 'createdAt: -1',
      }),
    ).toThrow('Organization not found');
  });
});
