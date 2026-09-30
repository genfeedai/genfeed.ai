import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { describe, expect, it } from 'vitest';
import { getStoryboardAssetLabel } from './storyboard-asset-label';

const id = 'asset-record-123';

for (const Model of [Ingredient, Image, Video]) {
  describe(`${Model.name} Storyboard labels`, () => {
    it('rejects the model ID-prefix fallback when metadata is missing', () => {
      const asset = new Model({ id });
      expect(asset.metadataLabel).toBe(id.slice(0, 8));
      expect(getStoryboardAssetLabel(asset)).toBeUndefined();
    });
    it.each(['', '   '])('rejects a blank stored label %j', (label) => {
      expect(
        getStoryboardAssetLabel(
          new Model({ id, metadata: new Metadata({ label }) }),
        ),
      ).toBeUndefined();
    });
    it.each(['Morning coffee', id.slice(0, 8)])(
      'preserves a genuine stored label %j',
      (label) => {
        expect(
          getStoryboardAssetLabel(
            new Model({ id, metadata: new Metadata({ label }) }),
          ),
        ).toBe(label);
      },
    );
  });
}
