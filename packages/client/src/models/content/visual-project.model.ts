import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IVisualProject,
  IVisualRevision,
} from '@genfeedai/contracts/interfaces';

export class VisualProject extends BaseEntity implements IVisualProject {
  declare public organizationId: string;
  declare public brandId: string;
  declare public userId: string;
  declare public label: string;
  declare public currentRevision: number;
  declare public nextRevisionCursor: number | null;
  declare public revisions: IVisualRevision[];

  constructor(data: Partial<IVisualProject> = {}) {
    super(data);
  }
}
