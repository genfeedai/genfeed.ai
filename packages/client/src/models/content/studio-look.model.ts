import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IStudioLook,
  StudioLookAssetType,
} from '@genfeedai/interfaces/studio/studio-generate.interface';

export class StudioLook extends BaseEntity implements IStudioLook {
  public declare assetType: StudioLookAssetType;
  public declare brandId: string;
  public declare camera: string;
  public declare cameraMovement?: string | null;
  public declare label: string;
  public declare lens: string;
  public declare lighting: string;
  public declare mood: string;
  public declare organizationId: string;
  public declare promptTemplate: string;
  public declare scene: string;
  public declare style: string;
  public declare userId: string;

  constructor(data: Partial<IStudioLook> = {}) {
    super(data);
  }
}
