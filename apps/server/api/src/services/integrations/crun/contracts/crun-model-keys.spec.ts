import { crunImageQuoteIntentSchema } from '@api/collections/images/dto/create-crun-image-quote.dto';
import { crunVideoQuoteIntentSchema } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_VIDEO_MANIFEST,
} from '@api/services/integrations/crun/contracts/crun-manifest';

describe('Crun DTO model enums', () => {
  it('image zod enum options equal the image manifest keys', () => {
    expect([...crunImageQuoteIntentSchema.in.shape.model.options]).toEqual(
      CRUN_IMAGE_MANIFEST.map((entry) => entry.key),
    );
  });

  it('video zod enum options equal the video manifest keys', () => {
    expect([...crunVideoQuoteIntentSchema.in.shape.model.options]).toEqual(
      CRUN_VIDEO_MANIFEST.map((entry) => entry.key),
    );
  });
});
