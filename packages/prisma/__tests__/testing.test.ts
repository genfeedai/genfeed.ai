import { describe, expect, it } from 'vitest';
import * as testingSubpath from '../src/testing';

describe('@genfeedai/prisma/testing subpath', () => {
  it('re-exports the model metadata helpers', () => {
    expect(typeof testingSubpath.getModelMeta).toBe('function');
    expect(testingSubpath.PRISMA_MODEL_METADATA).toBeDefined();
  });

  it('re-exports generated Prisma enums without the client runtime', () => {
    const exportedNames = Object.keys(testingSubpath);

    expect(exportedNames).not.toContain('PrismaClient');
    expect(exportedNames).not.toContain('Prisma');
    expect(exportedNames.length).toBeGreaterThan(2);
  });
});
