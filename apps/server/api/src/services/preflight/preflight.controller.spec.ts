import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PreflightController } from '@api/services/preflight/preflight.controller';
import { PreflightService } from '@api/services/preflight/preflight.service';
import { Test } from '@nestjs/testing';

const mock = {
  checks: [{ name: 'db', ok: true }],
  ready: true,
  status: 'ready' as const,
  timestamp: new Date().toISOString(),
};

describe('PreflightController', () => {
  let ctrl: PreflightController;
  let svc: PreflightService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PreflightController],
      providers: [
        {
          provide: PreflightService,
          useValue: { checkReadiness: vi.fn().mockResolvedValue(mock) },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    ctrl = mod.get(PreflightController);
    svc = mod.get(PreflightService);
  });

  it('GET /preflight/status', async () => {
    const r = await ctrl.getStatus();
    expect(r.ready).toBe(true);
  });

  it('GET /preflight/:feature', async () => {
    await ctrl.getFeatureStatus('studio');
    expect(svc.checkReadiness).toHaveBeenCalledWith('studio');
  });
});
