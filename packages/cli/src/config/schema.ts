import { z } from 'zod';

export const profileSchema = z.object({
  activeBrand: z.string().optional(),
  activePersona: z.string().optional(),
  agent: z
    .object({
      lastThreadIdByOrganization: z.record(z.string(), z.string()).default({}),
      model: z.string().optional(),
    })
    .default({ lastThreadIdByOrganization: {} }),
  apiKey: z.string().optional(),
  apiUrl: z.string().url().default('https://api.genfeed.ai/v1'),
  defaults: z
    .object({
      imageModel: z.string().default('imagen-4'),
      videoModel: z.string().default('google-veo-3'),
    })
    .default({ imageModel: 'imagen-4', videoModel: 'google-veo-3' }),
  fleetApiPort: z.number().default(8189),
  fleetHost: z.string().default('100.106.229.81'),
  organizationId: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
  token: z.string().optional(),
  userId: z.string().optional(),
});

export type Profile = z.infer<typeof profileSchema>;

export const configSchema = z.object({
  activeProfile: z.string().default('default'),
  profiles: z.record(z.string(), profileSchema).default(() => ({
    default: profileSchema.parse({}),
  })),
});

export type Config = z.infer<typeof configSchema>;

export const defaultProfile: Profile = profileSchema.parse({});

export const defaultConfig: Config = configSchema.parse({});
