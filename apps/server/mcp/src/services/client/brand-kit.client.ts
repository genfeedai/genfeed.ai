import type { BaseApiClient } from './base-api-client';

const BRAND_KIT_SECTION_PATH = {
  visual_identity: 'visual-identity',
  writing_voice: 'writing-voice',
  strategy: 'strategy',
} as const;

export type BrandKitSection = keyof typeof BRAND_KIT_SECTION_PATH;

export class BrandKitClient {
  constructor(private readonly base: BaseApiClient) {}

  updateSection(
    brandId: string,
    section: BrandKitSection,
    fields: Record<string, unknown>,
  ): Promise<void> {
    return this.base.request(
      'saving Brand Kit section',
      async (http) => {
        await http.patch(
          `/brands/${encodeURIComponent(brandId)}/brand-kit/${BRAND_KIT_SECTION_PATH[section]}`,
          fields,
        );
      },
      this.base.failWithDetail('Failed to save the Brand Kit section'),
    );
  }
}
