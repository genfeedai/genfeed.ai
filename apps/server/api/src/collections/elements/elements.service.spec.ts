import { ElementsService } from '@api/collections/elements/elements.service';

type FindAllMock = ReturnType<typeof vi.fn>;

function buildService(docsByType: Record<string, unknown[]> = {}) {
  const make = (name: string): { findAll: FindAllMock } => ({
    findAll: vi.fn().mockResolvedValue({ docs: docsByType[name] ?? [] }),
  });
  const services = {
    blacklists: make('blacklists'),
    cameraMovements: make('cameraMovements'),
    cameras: make('cameras'),
    lenses: make('lenses'),
    lightings: make('lightings'),
    moods: make('moods'),
    scenes: make('scenes'),
    sounds: make('sounds'),
    styles: make('styles'),
  };
  const service = new ElementsService(
    services.cameras as never,
    services.moods as never,
    services.scenes as never,
    services.styles as never,
    services.sounds as never,
    services.blacklists as never,
    services.lightings as never,
    services.lenses as never,
    services.cameraMovements as never,
  );

  return { service, services };
}

describe('ElementsService.findAllElements', () => {
  it('queries active platform defaults plus own rows once per type', async () => {
    const { service, services } = buildService();

    await service.findAllElements('org-1');

    for (const type of [
      'cameraMovements',
      'cameras',
      'lenses',
      'lightings',
      'moods',
      'scenes',
      'sounds',
      'styles',
    ] as const) {
      expect(services[type].findAll).toHaveBeenCalledTimes(1);
      expect(services[type].findAll).toHaveBeenCalledWith(
        {
          orderBy: { createdAt: -1, key: 1, sortOrder: 1 },
          where: {
            isDeleted: false,
            OR: [
              { isActive: true, organizationId: null },
              { organizationId: 'org-1' },
            ],
          },
        },
        { pagination: false },
      );
    }
  });

  it('keeps blacklists organization-only', async () => {
    const { service, services } = buildService();

    await service.findAllElements('org-1');

    expect(services.blacklists.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, organizationId: 'org-1' },
      }),
      { pagination: false },
    );
  });

  it('lists defaults first, flagged, then own elements', async () => {
    const { service } = buildService({
      styles: [
        {
          createdAt: new Date('2026-02-01'),
          key: 'mine',
          organizationId: 'org-1',
        },
        { key: 'anime', organizationId: null, sortOrder: 30 },
        { key: 'photoreal', organizationId: null, sortOrder: 0 },
      ],
    });

    const { styles } = await service.findAllElements('org-1');

    expect(styles.map((style) => [style.key, style.isPlatformDefault])).toEqual(
      [
        ['photoreal', true],
        ['anime', true],
        ['mine', false],
      ],
    );
  });

  it('still lists the organization own elements when the catalog is empty', async () => {
    const { service } = buildService({
      moods: [{ key: 'mine', organizationId: 'org-1' }],
    });

    const { moods, styles } = await service.findAllElements('org-1');

    expect(moods).toHaveLength(1);
    expect(styles).toEqual([]);
  });

  it('never returns blacklists or other organizations without an organization', async () => {
    const { service, services } = buildService();

    const result = await service.findAllElements(undefined);

    expect(services.blacklists.findAll).not.toHaveBeenCalled();
    expect(result.blacklists).toEqual([]);
    expect(services.styles.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          OR: [{ isActive: true, organizationId: null }],
        },
      }),
      { pagination: false },
    );
  });
});
