import { describe, expect, it } from 'vitest';
import { contentLearningDatasetAttributes } from '../attributes/analytics/content-learning-dataset.attributes';
import { contentLearningReleaseAttributes } from '../attributes/analytics/content-learning-release.attributes';
import { contentLearningRunAttributes } from '../attributes/analytics/content-learning-run.attributes';

describe('public learning projections', () => {
  it('never exposes tenant source manifests, owned log source references, recipient salts or operator rights text', () => {
    for (const attributes of [
      contentLearningDatasetAttributes,
      contentLearningRunAttributes,
      contentLearningReleaseAttributes,
    ]) {
      expect(attributes).not.toContain('sourceReference');
      expect(attributes).not.toContain('recipientSalt');
      expect(attributes).not.toContain('rightsStatement');
    }
    expect(contentLearningDatasetAttributes).not.toContain('manifest');
  });
});
