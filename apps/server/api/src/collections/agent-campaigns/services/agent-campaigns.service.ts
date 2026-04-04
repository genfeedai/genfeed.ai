import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import {
  AgentCampaign,
  type AgentCampaignDocument,
} from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AgentCampaignsService extends BaseService<
  AgentCampaignDocument,
  CreateAgentCampaignDto,
  UpdateAgentCampaignDto
> {
  constructor(
    @InjectModel(AgentCampaign.name, DB_CONNECTIONS.AGENT)
    model: AggregatePaginateModel<AgentCampaignDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Find campaign by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
  ): Promise<AgentCampaignDocument | null> {
    return this.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }
}
