import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  KnowledgeBaseScope,
  KnowledgeBaseStatus,
} from '@genfeedai/contracts';
import type { KnowledgeBase as KnowledgeBaseInterface } from '@genfeedai/contracts/interfaces';

export class KnowledgeBase
  extends BaseEntity
  implements KnowledgeBaseInterface
{
  declare public label: string;
  declare public description?: string;
  declare public status: KnowledgeBaseStatus;
  declare public scope: KnowledgeBaseScope;
  declare public organizationId?: string;
  declare public brandId?: string;
  declare public userId?: string;
  declare public branding?: KnowledgeBaseInterface['branding'];
  declare public sources?: KnowledgeBaseInterface['sources'];
  declare public fontFamily?: string;
  declare public defaultVideoModel?: string;
  declare public defaultImageModel?: string;
  declare public defaultImageToVideoModel?: string;
  declare public defaultMusicModel?: string;
  declare public lastAnalyzedAt?: string;
  declare public isActive: boolean;

  constructor(data: Partial<KnowledgeBaseInterface> = {}) {
    super(data);
  }
}
