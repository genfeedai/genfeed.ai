import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import type {
  IStudioGenerateDraft,
  StudioGenerateDraftReference,
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';

export class StudioGenerateDraft
  extends BaseEntity
  implements IStudioGenerateDraft
{
  declare public attachments: StudioGenerateDraftReference[];
  declare public brandId: string;
  declare public droppedReferenceIds: string[];
  declare public knowledgeSelection: KnowledgeSelection;
  declare public organizationId: string;
  declare public prompt: string;
  declare public references: StudioGenerateDraftReference[];
  declare public settingsByType: Partial<
    Record<StudioPlaygroundType, Partial<StudioPlaygroundSettings>>
  >;
  declare public type: StudioPlaygroundType;
  declare public userId: string;

  constructor(data: Partial<IStudioGenerateDraft> = {}) {
    super(data);
  }
}
