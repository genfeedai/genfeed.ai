import type {
  HeyGenAvatarRef,
  HeyGenCatalogAvatar,
  HeyGenGender,
} from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

export const catalogPageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean(),
  next_token: z.string().nullish(),
});
// HeyGen reports gender loosely ("Male", "female", "unknown"); keep only what it states.
export const genderSchema = z
  .string()
  .nullish()
  .transform((value): HeyGenGender | null => {
    const gender = value?.trim().toLowerCase();
    return gender === 'male' || gender === 'female' ? gender : null;
  });
export const voiceSchema = z.object({
  voice_id: z.string().trim().min(1),
  name: z.string(),
  gender: genderSchema,
  preview_audio_url: z.string().nullish(),
});
export const lookSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string(),
  gender: genderSchema,
  preview_image_url: z.string().nullish(),
  avatar_type: z.string().nullish(),
  group_id: z.string().nullish(),
  supported_api_engines: z.array(z.string()).optional().default([]),
  status: z.string().nullish(),
});
export const groupSchema = z.object({
  id: z.string().min(1),
  status: z.string().nullable(),
  consent_status: z.string().nullable(),
});

/** A look's persisted identity plus display-only catalogue metadata. */
export interface HeyGenCatalogLook {
  avatarRef: HeyGenAvatarRef;
  gender: HeyGenGender | null;
}

export function toCatalogAvatar(
  { avatarRef, gender }: HeyGenCatalogLook,
  index: number,
): HeyGenCatalogAvatar {
  return {
    avatarId: avatarRef.lookId,
    index,
    name: avatarRef.label,
    gender,
    preview: avatarRef.preview ?? '',
    avatarRef,
  };
}
