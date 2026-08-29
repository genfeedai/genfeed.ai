import type { StudioLook } from '@genfeedai/prisma';

export class StudioLookEntity implements StudioLook {
  id!: string;
  organizationId!: string;
  brandId!: string;
  userId!: string;
  label!: string;
  assetType!: string;
  promptTemplate!: string;
  style!: string;
  mood!: string;
  scene!: string;
  camera!: string;
  lens!: string;
  lighting!: string;
  cameraMovement!: string | null;
  modelKey!: string | null;
  prioritize!: string | null;
  outputs!: number | null;
  aspectRatio!: string | null;
  duration!: number | null;
  resolution!: string | null;
  brandingMode!: string | null;
  isPromptEnhanceEnabled!: boolean;
  isDeleted!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  [key: string]: unknown;

  constructor(partial: Partial<StudioLook> = {}) {
    Object.assign(this, partial);
  }
}
