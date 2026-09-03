import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { IMetadata, IPrompt, ITag } from '@genfeedai/contracts/interfaces';

export class Metadata extends BaseEntity implements IMetadata {
  declare public label: string;
  declare public description?: string;
  declare public model?: string;
  declare public result?: string;
  declare public extension?: string;
  declare public language?: string;
  declare public duration?: number;
  declare public width?: number;
  declare public height?: number;
  declare public size?: number;
  declare public style?: string;
  declare public hasAudio?: boolean;
  declare public shortId?: string;
  declare public prompt?: IPrompt;
  declare public tags?: ITag[];
  declare public url?: string;

  constructor(data: Partial<IMetadata> = {}) {
    super(data);
  }
}
