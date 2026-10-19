/**
 * Agent-proposed Studio drafts (#7341). Playground and Storyboard open on
 * these, so a member can generate without typing a prompt. Each proposal
 * carries a short `why` grounded in the brand and its performance.
 */

import { z } from 'zod';

export const STUDIO_PROPOSAL_SURFACES = [
  'image',
  'video',
  'storyboard',
] as const;
export type StudioProposalSurface = (typeof STUDIO_PROPOSAL_SURFACES)[number];

export const STUDIO_PROPOSAL_ASPECT_RATIOS = [
  '1:1',
  '4:5',
  '9:16',
  '16:9',
] as const;

export const STUDIO_PROPOSAL_DEFAULT_COUNT = 3;
export const STUDIO_PROPOSAL_MAX_COUNT = 6;

export const studioMediaProposalSchema = z.object({
  aspectRatio: z.enum(STUDIO_PROPOSAL_ASPECT_RATIOS),
  prompt: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
});

export const studioStoryboardShotSchema = z.object({
  description: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(30),
});

export const studioStoryboardProposalSchema = z.object({
  brief: z.string().min(1),
  shots: z.array(studioStoryboardShotSchema).min(2).max(10),
  title: z.string().min(1),
  why: z.string().min(1),
});

export const studioMediaProposalGenerationSchema = z.object({
  proposals: z
    .array(studioMediaProposalSchema)
    .min(1)
    .max(STUDIO_PROPOSAL_MAX_COUNT),
});

export const studioStoryboardProposalGenerationSchema = z.object({
  proposals: z
    .array(studioStoryboardProposalSchema)
    .min(1)
    .max(STUDIO_PROPOSAL_MAX_COUNT),
});

export type StudioMediaProposal = z.infer<typeof studioMediaProposalSchema>;
export type StudioStoryboardProposal = z.infer<
  typeof studioStoryboardProposalSchema
>;

export const STUDIO_MEDIA_PROPOSALS_SCHEMA_NAME = 'studio_media_proposals';
export const STUDIO_STORYBOARD_PROPOSALS_SCHEMA_NAME =
  'studio_storyboard_proposals';

/**
 * `isBrandApproved` false means the brand has no approved Brand OS: the
 * surface keeps its empty composer and asks the member to approve the kit.
 */
export type StudioProposalsResult =
  | {
      isBrandApproved: boolean;
      proposals: StudioMediaProposal[];
      surface: 'image' | 'video';
    }
  | {
      isBrandApproved: boolean;
      proposals: StudioStoryboardProposal[];
      surface: 'storyboard';
    };
