import { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

describe('ArgilWebhookTokenService', () => {
  it('creates stable per-video tokens and accepts the matching token', () => {
    const service = new ArgilWebhookTokenService({
      get: vi.fn().mockReturnValue('webhook-secret'),
    } as never);

    const token = service.create('video-1');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(() => service.assert('video-1', token)).not.toThrow();
    expect(service.create('video-2')).not.toBe(token);
  });

  it('rejects a token generated for another video', () => {
    const service = new ArgilWebhookTokenService({
      get: vi.fn().mockReturnValue('webhook-secret'),
    } as never);

    expect(() => service.assert('video-1', service.create('video-2'))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when webhook verification is not configured', () => {
    const service = new ArgilWebhookTokenService({
      get: vi.fn().mockReturnValue(undefined),
    } as never);

    expect(() => service.assert('video-1', 'token')).toThrow(
      ServiceUnavailableException,
    );
  });
});
