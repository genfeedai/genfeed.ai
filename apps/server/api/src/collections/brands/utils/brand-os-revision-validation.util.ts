import { BadRequestException } from '@nestjs/common';

export function validateBrandOsEvidence(entries: unknown[]): void {
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('label' in entry) ||
      typeof entry.label !== 'string' ||
      !('sourceType' in entry) ||
      typeof entry.sourceType !== 'string' ||
      ![
        'current_brand',
        'website',
        'manual',
        'uploaded_guidance',
        'system',
      ].includes(entry.sourceType)
    )
      throw new BadRequestException('Invalid Brand OS evidence');
    for (const key of ['url', 'excerpt', 'sourceId']) {
      const value: unknown = Reflect.get(entry, key);
      if (value !== undefined && typeof value !== 'string')
        throw new BadRequestException('Invalid Brand OS evidence value');
    }
  }
}

export function validateBrandOsDiagnostics(entries: unknown[]): void {
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('code' in entry) ||
      typeof entry.code !== 'string' ||
      !('message' in entry) ||
      typeof entry.message !== 'string' ||
      !('severity' in entry) ||
      typeof entry.severity !== 'string' ||
      !['info', 'warning', 'error'].includes(entry.severity)
    )
      throw new BadRequestException('Invalid Brand OS diagnostic');
  }
}
