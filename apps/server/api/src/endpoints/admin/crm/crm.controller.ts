import { CrmService } from '@api/endpoints/admin/crm/crm.service';
import {
  CreateAlignmentRuleDto,
  CreateCompanyDto,
  CreateCostRecordDto,
  CreateCrmTaskDto,
  CreateLeadActivityDto,
  CreateLeadDto,
  CrmGenerateContentDto,
  PrepareBrandDto,
  SendInvitationDto,
  UpdateAlignmentRuleDto,
  UpdateCrmTaskDto,
  UpdateLeadDto,
} from '@api/endpoints/admin/crm/dto';
import { ProactiveOnboardingService } from '@api/endpoints/admin/crm/proactive-onboarding.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { LeadStatus } from '@genfeedai/enums';
import {
  AlignmentRuleSerializer,
  CompanySerializer,
  CostRecordSerializer,
  CrmAlignmentSummarySerializer,
  CrmAlignmentValidationSerializer,
  CrmAnalyticsSerializer,
  CrmGenerateContentResultSerializer,
  CrmMarginSummarySerializer,
  CrmMonthlyMarginSerializer,
  CrmPreparationStatusSerializer,
  CrmPrepareBrandResultSerializer,
  CrmReviewContentSerializer,
  CrmSendInvitationResultSerializer,
  CrmTaskSerializer,
  LeadActivitySerializer,
  LeadSerializer,
  RevenueRecordSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / CRM')
@Controller('admin/crm')
@UseGuards(IpWhitelistGuard)
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    private readonly proactiveOnboardingService: ProactiveOnboardingService,
    private readonly loggerService: LoggerService,
  ) {}

  // === Leads ===

  @Get('leads')
  @ApiOperation({ summary: 'List leads with optional status filter' })
  @ApiQuery({
    enum: LeadStatus,
    enumName: 'LeadStatus',
    name: 'status',
    required: false,
  })
  async listLeads(
    @Req() request: Request,
    @Query('status') status: LeadStatus | undefined,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getLeads(organization, status);
      return serializeCollection(request, LeadSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listLeads');
    }
  }

  @Get('leads/:id')
  @ApiOperation({ summary: 'Get lead by ID' })
  async getLead(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getLead(id, organization);
      return serializeSingle(request, LeadSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getLead');
    }
  }

  @Post('leads')
  @ApiOperation({ summary: 'Create a new lead' })
  async createLead(
    @Req() request: Request,
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.createLead({
        ...dto,
        organization: ObjectIdUtil.toObjectId(organization)!,
      });
      return serializeSingle(request, LeadSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createLead');
    }
  }

  @Patch('leads/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a lead' })
  async updateLead(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.updateLead(id, organization, dto);
      return serializeSingle(request, LeadSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'updateLead');
    }
  }

  @Delete('leads/:id')
  @ApiOperation({ summary: 'Soft-delete a lead' })
  async deleteLead(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.deleteLead(id, organization);
      return serializeSingle(request, LeadSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteLead');
    }
  }

  @Get('leads/:id/activities')
  @ApiOperation({ summary: 'List lead activities' })
  async listLeadActivities(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getLeadActivities(id, organization);
      return serializeCollection(request, LeadActivitySerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listLeadActivities',
      );
    }
  }

  @Post('leads/:id/activities')
  @ApiOperation({ summary: 'Create lead activity' })
  async createLeadActivity(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: CreateLeadActivityDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: dbUserId } = getPublicMetadata(user);
      const data = await this.crmService.createLeadActivity(
        id,
        organization,
        dbUserId,
        dto,
      );
      return serializeSingle(request, LeadActivitySerializer, data);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createLeadActivity',
      );
    }
  }

  // === Proactive Onboarding ===

  @Post('leads/:id/prepare-brand')
  @ApiOperation({ summary: 'Prepare brand for proactive onboarding' })
  async prepareBrand(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: PrepareBrandDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.proactiveOnboardingService.prepareBrand(
        id,
        organization,
        dto,
      );
      return serializeSingle(request, CrmPrepareBrandResultSerializer, {
        _id: `prepare-brand:${id}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'prepareBrand');
    }
  }

  @Post('leads/:id/generate-content')
  @ApiOperation({ summary: 'Generate content for proactive onboarding' })
  async generateContent(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: CrmGenerateContentDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.proactiveOnboardingService.generateContent(
        id,
        organization,
        dto,
      );
      return serializeSingle(request, CrmGenerateContentResultSerializer, {
        _id: `generate-content:${id}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'generateContent');
    }
  }

  @Post('leads/:id/send-invitation')
  @ApiOperation({ summary: 'Send invitation for proactive onboarding' })
  async sendInvitation(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: SendInvitationDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.proactiveOnboardingService.sendInvitation(
        id,
        organization,
        dto,
      );
      return serializeSingle(request, CrmSendInvitationResultSerializer, {
        _id: `send-invitation:${id}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'sendInvitation');
    }
  }

  @Get('leads/:id/preparation-status')
  @ApiOperation({ summary: 'Get proactive onboarding preparation status' })
  async getPreparationStatus(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.proactiveOnboardingService.getPreparationStatus(
        id,
        organization,
      );
      return serializeSingle(request, CrmPreparationStatusSerializer, {
        _id: `preparation-status:${id}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getPreparationStatus',
      );
    }
  }

  @Get('leads/:id/review-content')
  @ApiOperation({
    summary: 'Review generated content for proactive onboarding',
  })
  async reviewContent(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.proactiveOnboardingService.reviewContent(
        id,
        organization,
      );
      return serializeSingle(request, CrmReviewContentSerializer, {
        _id: `review-content:${id}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'reviewContent');
    }
  }

  // === Companies ===

  @Get('companies')
  @ApiOperation({ summary: 'List companies' })
  async listCompanies(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getCompanies(organization);
      return serializeCollection(request, CompanySerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listCompanies');
    }
  }

  @Get('companies/:id')
  @ApiOperation({ summary: 'Get company by ID' })
  async getCompany(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getCompany(id, organization);
      return serializeSingle(request, CompanySerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getCompany');
    }
  }

  @Post('companies')
  @ApiOperation({ summary: 'Create a company' })
  async createCompany(
    @Req() request: Request,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.createCompany({
        ...dto,
        organization: ObjectIdUtil.toObjectId(organization)!,
      });
      return serializeSingle(request, CompanySerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createCompany');
    }
  }

  @Patch('companies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a company' })
  async updateCompany(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.updateCompany(id, organization, dto);
      return serializeSingle(request, CompanySerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'updateCompany');
    }
  }

  // === Tasks ===

  @Get('tasks')
  @ApiOperation({ summary: 'List CRM tasks' })
  async listTasks(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getTasks(organization);
      return serializeCollection(request, CrmTaskSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listTasks');
    }
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a CRM task' })
  async createTask(
    @Req() request: Request,
    @Body() dto: CreateCrmTaskDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      // @ts-expect-error TS2345
      const data = await this.crmService.createTask({
        ...dto,
        organization: ObjectIdUtil.toObjectId(organization)!,
      });
      return serializeSingle(request, CrmTaskSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createTask');
    }
  }

  @Patch('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a CRM task' })
  async updateTask(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCrmTaskDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      // @ts-expect-error TS2345
      const data = await this.crmService.updateTask(id, organization, dto);
      return serializeSingle(request, CrmTaskSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'updateTask');
    }
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Soft-delete a CRM task' })
  async deleteTask(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.deleteTask(id, organization);
      return serializeSingle(request, CrmTaskSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteTask');
    }
  }

  // === Alignment ===

  @Get('alignment/rules')
  @ApiOperation({ summary: 'List CRM alignment rules' })
  async listAlignmentRules(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getAlignmentRules(organization);
      return serializeCollection(request, AlignmentRuleSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listAlignmentRules',
      );
    }
  }

  @Post('alignment/rules')
  @ApiOperation({ summary: 'Create CRM alignment rule' })
  async createAlignmentRule(
    @Req() request: Request,
    @Body() dto: CreateAlignmentRuleDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.createAlignmentRule({
        ...dto,
        organization: ObjectIdUtil.toObjectId(organization)!,
      });
      return serializeSingle(request, AlignmentRuleSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createAlignmentRule',
      );
    }
  }

  @Patch('alignment/rules/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update CRM alignment rule' })
  async updateAlignmentRule(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() dto: UpdateAlignmentRuleDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.updateAlignmentRule(
        id,
        organization,
        dto,
      );
      return serializeSingle(request, AlignmentRuleSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'updateAlignmentRule',
      );
    }
  }

  @Get('alignment/summary')
  @ApiOperation({ summary: 'Get CRM alignment summary' })
  async getAlignmentSummary(
    @Req() request: Request,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getAlignmentSummary(organization);
      return serializeSingle(request, CrmAlignmentSummarySerializer, {
        _id: `alignment-summary:${organization}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getAlignmentSummary',
      );
    }
  }

  @Post('alignment/validate')
  @ApiOperation({ summary: 'Validate CRM alignment against current data' })
  async validateAlignment(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.validateAlignment(organization);
      return serializeSingle(request, CrmAlignmentValidationSerializer, {
        _id: `alignment-validation:${organization}`,
        ...data,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'validateAlignment',
      );
    }
  }

  // === Financial ===

  @Get('costs')
  @ApiOperation({ summary: 'List cost records' })
  async listCosts(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getCostRecords(organization);
      return serializeCollection(request, CostRecordSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listCosts');
    }
  }

  @Post('costs')
  @ApiOperation({ summary: 'Create a cost record' })
  async createCost(
    @Req() request: Request,
    @Body() dto: CreateCostRecordDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      // @ts-expect-error TS2345
      const data = await this.crmService.createCostRecord({
        ...dto,
        organization: ObjectIdUtil.toObjectId(organization)!,
      });
      return serializeSingle(request, CostRecordSerializer, data);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'createCost');
    }
  }

  @Get('revenue')
  @ApiOperation({ summary: 'List revenue records' })
  async listRevenue(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      const data = await this.crmService.getRevenueRecords(organization);
      return serializeCollection(request, RevenueRecordSerializer, {
        docs: data,
        hasNextPage: false,
        hasPrevPage: false,
        limit: data.length,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: data.length,
        totalPages: 1,
      });
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'listRevenue');
    }
  }

  // === Analytics ===

  @Get('analytics')
  @ApiOperation({ summary: 'Get CRM analytics' })
  getAnalytics(
    @Req() request: Request,
    @Query('days') days: string | undefined,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      return this.crmService
        .getAnalytics(organization, Number(days) || 30)
        .then((data) =>
          serializeSingle(request, CrmAnalyticsSerializer, {
            _id: `analytics:${organization}:${Number(days) || 30}`,
            ...data,
          }),
        );
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getAnalytics');
    }
  }

  // === Margins ===

  @Get('margins/summary')
  @ApiOperation({ summary: 'Get margin summary' })
  getMarginSummary(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      return this.crmService.getMargins(organization).then((data) =>
        serializeSingle(request, CrmMarginSummarySerializer, {
          _id: `margin-summary:${organization}`,
          ...data,
        }),
      );
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getMarginSummary',
      );
    }
  }

  @Get('margins/monthly')
  @ApiOperation({ summary: 'Get monthly margin breakdown' })
  getMonthlyMargins(
    @Req() request: Request,
    @Query('year') year: string | undefined,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const reportYear = Number(year) || new Date().getFullYear();
      return this.crmService
        .getMonthlyMargins(organization, reportYear)
        .then((data) =>
          serializeCollection(request, CrmMonthlyMarginSerializer, {
            docs: data.map((item) => ({
              _id: `${reportYear}:${item.month}`,
              ...item,
            })),
            hasNextPage: false,
            hasPrevPage: false,
            limit: data.length,
            nextPage: null,
            page: 1,
            pagingCounter: 1,
            prevPage: null,
            totalDocs: data.length,
            totalPages: 1,
          }),
        );
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getMonthlyMargins',
      );
    }
  }

  @Get('margins')
  @ApiOperation({ summary: 'Get cost/revenue margins' })
  getMargins(@Req() request: Request, @CurrentUser() user: User) {
    try {
      const { organization } = getPublicMetadata(user);
      return this.crmService.getMargins(organization).then((data) =>
        serializeSingle(request, CrmMarginSummarySerializer, {
          _id: `margins:${organization}`,
          ...data,
        }),
      );
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'getMargins');
    }
  }
}
