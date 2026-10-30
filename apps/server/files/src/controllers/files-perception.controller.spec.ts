import type { MediaPerceptionArtefactsService } from '@files/services/perception/media-perception-artefacts.service';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FilesPerceptionController } from './files-perception.controller';

function controller() {
  const service = { fingerprint: vi.fn(), extract: vi.fn() };
  return {
    service,
    controller: new FilesPerceptionController(
      service as unknown as MediaPerceptionArtefactsService,
    ),
  };
}

describe('FilesPerceptionController request boundary', () => {
  it.each([undefined, null, [], {}, { url: 42 }, { url: 'not a url' }])(
    'rejects fingerprint body %j with 400 before fetching the asset',
    async (body) => {
      const { controller: subject, service } = controller();
      await expect(subject.fingerprint(body)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.fingerprint).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    {},
    { url: 'https://example.com/a.mp4' },
    {
      assetHash: 'x',
      frameCount: 0,
      kind: 'video',
      organizationId: '',
      url: 'nope',
    },
  ])('rejects artefacts body %j with 400 before extracting', async (body) => {
    const { controller: subject, service } = controller();
    await expect(subject.artefacts(body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.extract).not.toHaveBeenCalled();
  });
});
