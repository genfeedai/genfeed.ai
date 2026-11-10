import { Models3dController } from '@api/endpoints/v1/models3d/models3d.controller';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { UnauthorizedException } from '@nestjs/common';

function setup() {
  const models3d = {
    create: vi.fn().mockResolvedValue({ id: 'r1', status: 'sheet_pending' }),
    get: vi.fn().mockResolvedValue({ id: 'r1', status: 'ready' }),
    getFileUrl: vi.fn().mockResolvedValue('https://signed/glb'),
    startBuild: vi.fn().mockResolvedValue({ id: 'r1', status: 'building' }),
  };
  return { controller: new Models3dController(models3d as never), models3d };
}

const REQUEST = {
  user: { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
} as never;

describe('Models3dController', () => {
  it.each([
    ['create', ApiKeyScope.MODELS3D_WRITE],
    ['build', ApiKeyScope.MODELS3D_WRITE],
    ['get', ApiKeyScope.MODELS3D_READ],
    ['file', ApiKeyScope.MODELS3D_READ],
  ] as const)('%s requires %s', (method, scope) => {
    const handler = Models3dController.prototype[method];

    expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([scope]);
  });

  it('creates for the key organization, user and brand', async () => {
    const { controller, models3d } = setup();

    await controller.create(REQUEST, { imageUrl: 'https://x.test/a.png' });

    expect(models3d.create).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
      { imageUrl: 'https://x.test/a.png' },
      undefined,
    );
  });

  it('passes an uploaded photo through', async () => {
    const { controller, models3d } = setup();
    const buffer = Buffer.from('x');

    await controller.create(REQUEST, {}, {
      buffer,
      mimetype: 'image/png',
    } as never);

    expect(models3d.create).toHaveBeenCalledWith(
      expect.anything(),
      {},
      {
        buffer,
        mimetype: 'image/png',
      },
    );
  });

  it('wraps the signed GLB URL', async () => {
    const { controller } = setup();

    await expect(controller.file(REQUEST, 'r1')).resolves.toEqual({
      url: 'https://signed/glb',
    });
  });

  it('starts a build and reads status for the caller', async () => {
    const { controller, models3d } = setup();

    await controller.build(REQUEST, 'r1');
    await controller.get(REQUEST, 'r1');

    expect(models3d.startBuild).toHaveBeenCalledWith(expect.anything(), 'r1');
    expect(models3d.get).toHaveBeenCalledWith(expect.anything(), 'r1');
  });

  it('rejects a key with no organization', () => {
    const { controller } = setup();

    expect(() =>
      controller.get({ user: { userId: 'u' } } as never, 'r1'),
    ).toThrow(UnauthorizedException);
  });

  it('accepts the id fallback for the user', async () => {
    const { controller, models3d } = setup();

    await controller.get(
      { user: { id: 'u2', organizationId: 'org-1' } } as never,
      'r1',
    );

    expect(models3d.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2' }),
      'r1',
    );
  });
});
