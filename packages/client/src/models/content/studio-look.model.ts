import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { RouterPriority } from '@genfeedai/contracts';
import type {
  IStudioLook,
  StudioLookAssetType,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';

export class StudioLook extends BaseEntity implements IStudioLook {
  declare public aspectRatio?: string | null;
  declare public assetType: StudioLookAssetType;
  declare public brandId: string;
  declare public brandingMode?: 'brand' | 'off' | null;
  declare public camera: string;
  declare public cameraMovement?: string | null;
  declare public duration?: number | null;
  declare public isPromptEnhanceEnabled?: boolean;
  declare public label: string;
  declare public lens: string;
  declare public lighting: string;
  declare public modelKey?: string | null;
  declare public mood: string;
  declare public organizationId: string;
  declare public outputs?: number | null;
  declare public prioritize?: RouterPriority | null;
  declare public promptTemplate: string;
  declare public resolution?: string | null;
  declare public scene: string;
  declare public style: string;
  declare public userId: string;

  constructor(data: Partial<IStudioLook> = {}) {
    super(data);
  }
}
