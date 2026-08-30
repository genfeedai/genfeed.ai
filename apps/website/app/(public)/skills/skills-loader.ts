import { EnvironmentService } from '@services/core/environment.service';
import { cache } from 'react';
import type { SkillRegistry } from './_data';

export const getSkillsRegistry = cache(
  async (): Promise<SkillRegistry | null> => {
    try {
      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/skills-pro/storefront`,
        {
          next: { revalidate: 300 },
        },
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as SkillRegistry;
    } catch {
      return null;
    }
  },
);
