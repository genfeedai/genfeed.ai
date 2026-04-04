import {
  IntegrationsService,
  ORG_INTEGRATION_PLATFORMS,
} from '@services/organization/integrations.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/interceptor.service');

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IntegrationsService(mockToken);
  });

  it('keeps the org integration platform list explicit and stable', () => {
    expect(ORG_INTEGRATION_PLATFORMS).toEqual(['discord', 'slack', 'telegram']);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(IntegrationsService);
  });

  it('exposes the expected CRUD methods', () => {
    expect(typeof service.findAll).toBe('function');
    expect(typeof service.create).toBe('function');
    expect(typeof service.update).toBe('function');
    expect(typeof service.remove).toBe('function');
  });
});
