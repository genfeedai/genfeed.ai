import { DB_CONNECTIONS } from '@api/constants/database.constants';
import {
  AlignmentRule,
  type AlignmentRuleDocument,
} from '@api/endpoints/admin/crm/schemas/alignment-rule.schema';
import {
  Company,
  type CompanyDocument,
} from '@api/endpoints/admin/crm/schemas/company.schema';
import {
  CostRecord,
  type CostRecordDocument,
} from '@api/endpoints/admin/crm/schemas/cost-record.schema';
import {
  CrmTask,
  type CrmTaskDocument,
} from '@api/endpoints/admin/crm/schemas/crm-task.schema';
import {
  Lead,
  type LeadDocument,
} from '@api/endpoints/admin/crm/schemas/lead.schema';
import {
  LeadActivity,
  type LeadActivityDocument,
} from '@api/endpoints/admin/crm/schemas/lead-activity.schema';
import {
  RevenueRecord,
  type RevenueRecordDocument,
} from '@api/endpoints/admin/crm/schemas/revenue-record.schema';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { LeadStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class CrmService {
  constructor(
    @InjectModel(Lead.name, DB_CONNECTIONS.CRM)
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadActivity.name, DB_CONNECTIONS.CRM)
    private readonly leadActivityModel: Model<LeadActivityDocument>,
    @InjectModel(AlignmentRule.name, DB_CONNECTIONS.CRM)
    private readonly alignmentRuleModel: Model<AlignmentRuleDocument>,
    @InjectModel(Company.name, DB_CONNECTIONS.CRM)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(CrmTask.name, DB_CONNECTIONS.CRM)
    private readonly crmTaskModel: Model<CrmTaskDocument>,
    @InjectModel(CostRecord.name, DB_CONNECTIONS.CRM)
    private readonly costRecordModel: Model<CostRecordDocument>,
    @InjectModel(RevenueRecord.name, DB_CONNECTIONS.CRM)
    private readonly revenueRecordModel: Model<RevenueRecordDocument>,
    private readonly notificationsService: NotificationsService,
    readonly _loggerService: LoggerService,
  ) {}

  // === Leads ===

  getLeads(
    organizationId: string,
    status?: LeadStatus,
  ): Promise<LeadDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: organizationId,
    };
    if (status) {
      query.status = status;
    }
    return this.leadModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async getLead(id: string, organizationId: string): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findOne({ _id: id, isDeleted: false, organization: organizationId })
      .exec();
    if (!lead) {
      throw new NotFoundException(`Lead "${id}" not found`);
    }
    return lead;
  }

  createLead(data: Partial<Lead>): Promise<LeadDocument> {
    return this.leadModel.create(data);
  }

  async updateLead(
    id: string,
    organizationId: string,
    data: Partial<Lead>,
  ): Promise<LeadDocument> {
    const previousLead = await this.getLead(id, organizationId);
    const lead = await this.leadModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: data },
        { returnDocument: 'after' },
      )
      .exec();
    if (!lead) {
      throw new NotFoundException(`Lead "${id}" not found`);
    }

    await this.handlePostUpdateEffects(
      previousLead,
      lead,
      organizationId,
      data,
    );

    return lead;
  }

  async deleteLead(id: string, organizationId: string): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: { isDeleted: true } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!lead) {
      throw new NotFoundException(`Lead "${id}" not found`);
    }
    return lead;
  }

  // === Lead Activities ===

  async getLeadActivities(
    leadId: string,
    organizationId: string,
  ): Promise<LeadActivityDocument[]> {
    await this.getLead(leadId, organizationId);
    return this.leadActivityModel
      .find({
        isDeleted: false,
        lead: leadId,
        organization: organizationId,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async createLeadActivity(
    leadId: string,
    organizationId: string,
    userId: string,
    data: {
      type: string;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<LeadActivityDocument> {
    await this.getLead(leadId, organizationId);
    return this.leadActivityModel.create({
      ...data,
      createdBy: userId,
      lead: leadId,
      organization: organizationId,
    });
  }

  private async handlePostUpdateEffects(
    previousLead: LeadDocument,
    updatedLead: LeadDocument,
    organizationId: string,
    data: Partial<Lead>,
  ): Promise<void> {
    if (
      data.status !== LeadStatus.CONTACTED ||
      previousLead.status === LeadStatus.CONTACTED ||
      !updatedLead.email ||
      updatedLead.lastOutreachStatus === 'sent'
    ) {
      return;
    }

    try {
      await this.notificationsService.sendCrmLeadOutreachEmail({
        company: updatedLead.company,
        leadId: updatedLead._id.toString(),
        leadName: updatedLead.name,
        organizationId,
        to: updatedLead.email,
      });

      const sentAt = new Date();

      await this.leadModel
        .findOneAndUpdate(
          {
            _id: updatedLead._id,
            isDeleted: false,
            organization: organizationId,
          },
          {
            $set: {
              lastContactedAt: sentAt,
              lastOutreachMessageId: `crm-contacted/${updatedLead._id.toString()}`,
              lastOutreachSentAt: sentAt,
              lastOutreachStatus: 'sent',
            },
          },
          { returnDocument: 'after' },
        )
        .exec();

      await this.leadActivityModel.create({
        createdBy: 'system',
        description: `Sent outreach email when lead entered ${LeadStatus.CONTACTED}`,
        lead: updatedLead._id,
        metadata: {
          provider: 'resend',
          trigger: 'status_transition',
          triggerStatus: LeadStatus.CONTACTED,
        },
        organization: organizationId,
        type: 'email',
      });

      updatedLead.lastContactedAt = sentAt;
      updatedLead.lastOutreachMessageId = `crm-contacted/${updatedLead._id.toString()}`;
      updatedLead.lastOutreachSentAt = sentAt;
      updatedLead.lastOutreachStatus = 'sent';
    } catch (error: unknown) {
      const failedAt = new Date();

      await this.leadModel
        .findOneAndUpdate(
          {
            _id: updatedLead._id,
            isDeleted: false,
            organization: organizationId,
          },
          {
            $set: {
              lastOutreachFailedAt: failedAt,
              lastOutreachStatus: 'failed',
            },
          },
        )
        .exec();

      await this.leadActivityModel.create({
        createdBy: 'system',
        description: `Failed outreach email when lead entered ${LeadStatus.CONTACTED}`,
        lead: updatedLead._id,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          provider: 'resend',
          trigger: 'status_transition',
          triggerStatus: LeadStatus.CONTACTED,
        },
        organization: organizationId,
        type: 'email',
      });

      updatedLead.lastOutreachFailedAt = failedAt;
      updatedLead.lastOutreachStatus = 'failed';
      this._loggerService.error('CRM outreach email failed', error);
    }
  }

  // === Companies ===

  getCompanies(organizationId: string): Promise<CompanyDocument[]> {
    return this.companyModel
      .find({ isDeleted: false, organization: organizationId })
      .sort({ name: 1 })
      .exec();
  }

  async getCompany(
    id: string,
    organizationId: string,
  ): Promise<CompanyDocument> {
    const company = await this.companyModel
      .findOne({ _id: id, isDeleted: false, organization: organizationId })
      .exec();
    if (!company) {
      throw new NotFoundException(`Company "${id}" not found`);
    }
    return company;
  }

  createCompany(data: Partial<Company>): Promise<CompanyDocument> {
    return this.companyModel.create(data);
  }

  async updateCompany(
    id: string,
    organizationId: string,
    data: Partial<Company>,
  ): Promise<CompanyDocument> {
    const company = await this.companyModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: data },
        { returnDocument: 'after' },
      )
      .exec();
    if (!company) {
      throw new NotFoundException(`Company "${id}" not found`);
    }
    return company;
  }

  // === Alignment Rules ===

  getAlignmentRules(organizationId: string): Promise<AlignmentRuleDocument[]> {
    return this.alignmentRuleModel
      .find({ isDeleted: false, organization: organizationId })
      .sort({ updatedAt: -1 })
      .exec();
  }

  createAlignmentRule(
    data: Partial<AlignmentRule>,
  ): Promise<AlignmentRuleDocument> {
    return this.alignmentRuleModel.create(data);
  }

  async updateAlignmentRule(
    id: string,
    organizationId: string,
    data: Partial<AlignmentRule>,
  ): Promise<AlignmentRuleDocument> {
    const rule = await this.alignmentRuleModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: data },
        { returnDocument: 'after' },
      )
      .exec();
    if (!rule) {
      throw new NotFoundException(`Alignment rule "${id}" not found`);
    }
    return rule;
  }

  async getAlignmentSummary(organizationId: string): Promise<{
    completenessPercentage: number;
    completeLeads: number;
    leadsMissingRequired: number;
    openIssues: {
      code: string;
      description: string;
      metric: number;
      severity: 'high' | 'low' | 'medium';
    }[];
    staleRules: number;
    totalLeads: number;
  }> {
    const [totalLeads, completeLeads, staleRules] = await Promise.all([
      this.leadModel.countDocuments({
        isDeleted: false,
        organization: organizationId,
      }),
      this.leadModel.countDocuments({
        brandUrl: { $exists: true, $ne: '' },
        company: { $exists: true, $ne: '' },
        email: { $exists: true, $ne: '' },
        isDeleted: false,
        name: { $exists: true, $ne: '' },
        organization: organizationId,
        source: { $exists: true, $ne: '' },
        status: { $exists: true, $ne: '' },
      }),
      this.alignmentRuleModel.countDocuments({
        $or: [
          {
            lastReviewedAt: {
              $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
          { lastReviewedAt: null },
          { status: { $ne: 'approved' } },
        ],
        isDeleted: false,
        organization: organizationId,
      }),
    ]);

    const leadsMissingRequired = Math.max(totalLeads - completeLeads, 0);
    const completenessPercentage =
      totalLeads > 0 ? Math.round((completeLeads / totalLeads) * 100) : 0;

    const openIssues: {
      code: string;
      description: string;
      metric: number;
      severity: 'high' | 'low' | 'medium';
    }[] = [];

    if (leadsMissingRequired > 0) {
      openIssues.push({
        code: 'missing_required_fields',
        description:
          'Some leads are missing required routing/onboarding fields',
        metric: leadsMissingRequired,
        severity: leadsMissingRequired > 20 ? 'high' : 'medium',
      });
    }
    if (staleRules > 0) {
      openIssues.push({
        code: 'stale_alignment_rules',
        description: 'Alignment rules need review or approval',
        metric: staleRules,
        severity: staleRules > 5 ? 'medium' : 'low',
      });
    }

    return {
      completeLeads,
      completenessPercentage,
      leadsMissingRequired,
      openIssues,
      staleRules,
      totalLeads,
    };
  }

  async validateAlignment(organizationId: string): Promise<{
    generatedAt: string;
    sampledLeadIds: string[];
    summary: {
      completenessPercentage: number;
      completeLeads: number;
      leadsMissingRequired: number;
      openIssues: {
        code: string;
        description: string;
        metric: number;
        severity: 'high' | 'low' | 'medium';
      }[];
      staleRules: number;
      totalLeads: number;
    };
  }> {
    const summary = await this.getAlignmentSummary(organizationId);
    const sample = await this.leadModel
      .find({
        $or: [
          { email: { $exists: false } },
          { email: '' },
          { source: { $exists: false } },
          { source: '' },
          { company: { $exists: false } },
          { company: '' },
          { brandUrl: { $exists: false } },
          { brandUrl: '' },
        ],
        isDeleted: false,
        organization: organizationId,
      })
      .select('_id')
      .limit(20)
      .lean()
      .exec();

    return {
      generatedAt: new Date().toISOString(),
      sampledLeadIds: sample.map((lead) => lead._id.toString()),
      summary,
    };
  }

  // === CRM Tasks ===

  getTasks(organizationId: string): Promise<CrmTaskDocument[]> {
    return this.crmTaskModel
      .find({ isDeleted: false, organization: organizationId })
      .sort({ dueDate: 1 })
      .exec();
  }

  createTask(data: Partial<CrmTask>): Promise<CrmTaskDocument> {
    return this.crmTaskModel.create(data);
  }

  async updateTask(
    id: string,
    organizationId: string,
    data: Partial<CrmTask>,
  ): Promise<CrmTaskDocument> {
    const task = await this.crmTaskModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: data },
        { returnDocument: 'after' },
      )
      .exec();
    if (!task) {
      throw new NotFoundException(`Task "${id}" not found`);
    }
    return task;
  }

  async deleteTask(
    id: string,
    organizationId: string,
  ): Promise<CrmTaskDocument> {
    const task = await this.crmTaskModel
      .findOneAndUpdate(
        { _id: id, isDeleted: false, organization: organizationId },
        { $set: { isDeleted: true } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!task) {
      throw new NotFoundException(`Task "${id}" not found`);
    }
    return task;
  }

  // === Financial Records ===

  getCostRecords(organizationId: string): Promise<CostRecordDocument[]> {
    return this.costRecordModel
      .find({ isDeleted: false, organization: organizationId })
      .sort({ date: -1 })
      .exec();
  }

  createCostRecord(data: Partial<CostRecord>): Promise<CostRecordDocument> {
    return this.costRecordModel.create(data);
  }

  getRevenueRecords(organizationId: string): Promise<RevenueRecordDocument[]> {
    return this.revenueRecordModel
      .find({ isDeleted: false, organization: organizationId })
      .sort({ date: -1 })
      .exec();
  }

  createRevenueRecord(
    data: Partial<RevenueRecord>,
  ): Promise<RevenueRecordDocument> {
    return this.revenueRecordModel.create(data);
  }

  // === Analytics ===

  async getMargins(
    organizationId: string,
  ): Promise<{ costs: number; revenue: number; margin: number }> {
    const [costs, revenue] = await Promise.all([
      this.costRecordModel
        .aggregate([
          { $match: { isDeleted: false, organization: organizationId } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
      this.revenueRecordModel
        .aggregate([
          { $match: { isDeleted: false, organization: organizationId } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec(),
    ]);

    const totalCosts = costs[0]?.total || 0;
    const totalRevenue = revenue[0]?.total || 0;

    return {
      costs: totalCosts,
      margin: totalRevenue - totalCosts,
      revenue: totalRevenue,
    };
  }

  async getAnalytics(
    organizationId: string,
    days: number,
  ): Promise<{
    funnel: { stage: string; count: number; percentage: number }[];
    velocity: { date: string; count: number }[];
    sources: { source: string; count: number }[];
    avgTimePerStage: { stage: string; avgDays: number }[];
  }> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const [funnelResult, velocityResult, sourcesResult, avgTimeResult] =
      await Promise.all([
        this.leadModel
          .aggregate([
            {
              $match: {
                isDeleted: false,
                organization: organizationId,
              },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ])
          .exec(),
        this.leadModel
          .aggregate([
            {
              $match: {
                createdAt: { $gte: sinceDate },
                isDeleted: false,
                organization: organizationId,
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .exec(),
        this.leadModel
          .aggregate([
            {
              $match: {
                isDeleted: false,
                organization: organizationId,
                source: { $exists: true, $ne: null },
              },
            },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ])
          .exec(),
        this.leadModel
          .aggregate([
            {
              $match: {
                isDeleted: false,
                organization: organizationId,
              },
            },
            {
              $group: {
                _id: '$status',
                avgDays: {
                  $avg: {
                    $divide: [
                      { $subtract: ['$updatedAt', '$createdAt'] },
                      1000 * 60 * 60 * 24,
                    ],
                  },
                },
              },
            },
            { $sort: { avgDays: 1 } },
          ])
          .exec(),
      ]);

    const totalLeads = funnelResult.reduce(
      (sum: number, item: { count: number }) => sum + item.count,
      0,
    );

    const funnel = funnelResult.map((item: { _id: string; count: number }) => ({
      count: item.count,
      percentage:
        totalLeads > 0 ? Math.round((item.count / totalLeads) * 100) : 0,
      stage: item._id || 'unknown',
    }));

    const velocity = velocityResult.map(
      (item: { _id: string; count: number }) => ({
        count: item.count,
        date: item._id,
      }),
    );

    const sources = sourcesResult.map(
      (item: { _id: string; count: number }) => ({
        count: item.count,
        source: item._id || 'unknown',
      }),
    );

    const avgTimePerStage = avgTimeResult.map(
      (item: { _id: string; avgDays: number }) => ({
        avgDays: Math.round(item.avgDays * 10) / 10,
        stage: item._id || 'unknown',
      }),
    );

    return { avgTimePerStage, funnel, sources, velocity };
  }

  async getMonthlyMargins(
    organizationId: string,
    year: number,
  ): Promise<
    {
      month: string;
      revenue: number;
      replicateCost: number;
      modelsCost: number;
      otherCost: number;
      totalCosts: number;
      margin: number;
      marginPercentage: number;
    }[]
  > {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const [costsByMonth, revenueByMonth] = await Promise.all([
      this.costRecordModel
        .aggregate([
          {
            $match: {
              date: { $gte: startDate, $lt: endDate },
              isDeleted: false,
              organization: organizationId,
            },
          },
          {
            $group: {
              _id: {
                category: { $toLower: '$category' },
                month: { $month: '$date' },
              },
              total: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
      this.revenueRecordModel
        .aggregate([
          {
            $match: {
              date: { $gte: startDate, $lt: endDate },
              isDeleted: false,
              organization: organizationId,
            },
          },
          {
            $group: {
              _id: { $month: '$date' },
              total: { $sum: '$amount' },
            },
          },
        ])
        .exec(),
    ]);

    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    return months.map((monthName, index) => {
      const monthNum = index + 1;
      const revenue =
        revenueByMonth.find(
          (r: { _id: number; total: number }) => r._id === monthNum,
        )?.total || 0;

      const replicateCost = costsByMonth
        .filter(
          (c: { _id: { month: number; category: string }; total: number }) =>
            c._id.month === monthNum && c._id.category === 'replicate',
        )
        .reduce(
          (
            sum: number,
            c: { _id: { month: number; category: string }; total: number },
          ) => sum + c.total,
          0,
        );

      const modelsCost = costsByMonth
        .filter(
          (c: { _id: { month: number; category: string }; total: number }) =>
            c._id.month === monthNum && c._id.category === 'model',
        )
        .reduce(
          (
            sum: number,
            c: { _id: { month: number; category: string }; total: number },
          ) => sum + c.total,
          0,
        );

      const otherCost = costsByMonth
        .filter(
          (c: { _id: { month: number; category: string }; total: number }) =>
            c._id.month === monthNum &&
            c._id.category !== 'replicate' &&
            c._id.category !== 'model',
        )
        .reduce(
          (
            sum: number,
            c: { _id: { month: number; category: string }; total: number },
          ) => sum + c.total,
          0,
        );

      const totalCosts = replicateCost + modelsCost + otherCost;
      const margin = revenue - totalCosts;
      const marginPercentage = revenue > 0 ? (margin / revenue) * 100 : 0;

      return {
        margin,
        marginPercentage: Math.round(marginPercentage * 10) / 10,
        modelsCost,
        month: monthName,
        otherCost,
        replicateCost,
        revenue,
        totalCosts,
      };
    });
  }
}
