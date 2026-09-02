import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { RouterPriority } from '@genfeedai/contracts';
import type {
  IStudioLook,
  StudioLookAssetType,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';

export class StudioLook extends BaseEntity implements IStudioLook {
  public declare aspectRatio?: string | null;
  public declare assetType: StudioLookAssetType;
  public declare brandId: string;
  public declare brandingMode?: 'brand' | 'off' | null;
  public declare camera: string;
  public declare cameraMovement?: string | null;
  public declare duration?: number | null;
  public declare isPromptEnhanceEnabled?: boolean;
  public declare label: string;
  public declare lens: string;
  public declare lighting: string;
  public declare modelKey?: string | null;
  public declare mood: string;
  public declare organizationId: string;
  public declare outputs?: number | null;
  public declare prioritize?: RouterPriority | null;
  public declare promptTemplate: string;
  public declare resolution?: string | null;
  public declare scene: string;
  public declare style: string;
  public declare userId: string;

  constructor(data: Partial<IStudioLook> = {}) {
    super(data);
  }
}
