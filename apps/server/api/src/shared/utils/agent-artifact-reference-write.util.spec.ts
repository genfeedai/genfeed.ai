import { authorizeAgentArtifactWrite } from '@api/shared/utils/agent-artifact-reference-write.util';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';

function makeReference(index: number): AgentArtifactReference {
  return {
    brandId: 'brand-1',
    kind: 'post',
    organizationId: 'org-1',
    recordId: `post-${index}`,
    serializer: 'post',
  };
}

describe('authorizeAgentArtifactWrite', () => {
  it('allows idempotent repeated references and pins at the 100-entry cap', async () => {
    const references = Array.from({ length: 100 }, (_, index) =>
      makeReference(index),
    );
    const pinIds = Array.from({ length: 100 }, (_, index) => `pin-${index}`);
    const authorizer = {
      resolveReference: vi.fn((reference: AgentArtifactReference) =>
        Promise.resolve({ reference }),
      ),
      resolveVersionPin: vi.fn(({ pinId }: { pinId: string }) =>
        Promise.resolve({
          reference: makeReference(Number(pinId.replace('pin-', ''))),
        }),
      ),
    };

    const result = await authorizeAgentArtifactWrite({
      authorizer: authorizer as never,
      inputs: [
        {
          artifactReferences: references,
          artifactVersionPinIds: pinIds,
        },
        {
          artifactReferences: references,
          artifactVersionPinIds: pinIds,
        },
      ],
      readContext: { brandId: 'brand-1', organizationId: 'org-1' },
    });

    expect(result.artifactReferences).toHaveLength(100);
    expect(result.artifactVersionPinIds).toHaveLength(100);
    expect(authorizer.resolveReference).toHaveBeenCalledTimes(100);
    expect(authorizer.resolveVersionPin).toHaveBeenCalledTimes(100);
  });

  it('rejects when pin resolution pushes the deduplicated result over 100 references', async () => {
    const references = Array.from({ length: 100 }, (_, index) =>
      makeReference(index),
    );
    const authorizer = {
      resolveReference: vi.fn((reference: AgentArtifactReference) =>
        Promise.resolve({ reference }),
      ),
      resolveVersionPin: vi.fn(() =>
        Promise.resolve({ reference: makeReference(100) }),
      ),
    };

    await expect(
      authorizeAgentArtifactWrite({
        authorizer: authorizer as never,
        inputs: [
          {
            artifactReferences: references,
            artifactVersionPinIds: ['pin-100'],
          },
        ],
        readContext: { brandId: 'brand-1', organizationId: 'org-1' },
      }),
    ).rejects.toThrow('artifactReferences cannot contain more than 100');
  });
});
