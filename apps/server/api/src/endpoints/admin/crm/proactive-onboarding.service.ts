import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type {
  CrmGenerateContentDto,
  PrepareBrandDto,
  SendInvitationDto,
} from '@api/endpoints/admin/crm/dto/proactive-onboarding.dto';
import {
  Lead,
  type LeadDocument,
} from '@api/endpoints/admin/crm/schemas/lead.schema';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type {
  IExtractedBrandData,
  IProactivePreparationStatus,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { ProactiveOnboardingStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

/** Credits seeded for proactive onboarding shadow orgs (same as normal signup) */
const PROACTIVE_ONBOARDING_CREDITS = 100;

/** Credits expiry: 1 year */
const PROACTIVE_CREDITS_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProactiveOnboardingService {
  constructor(
    @InjectModel(Lead.name, DB_CONNECTIONS.CRM)
    private readonly leadModel: Model<LeadDocument>,
    private readonly loggerService: LoggerService,
    private readonly brandScraperService: BrandScraperService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly organizationsService: OrganizationsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly clerkService: ClerkService,
    private readonly usersService: UsersService,
    private readonly membersService: MembersService,
    private readonly postsService: PostsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Create shadow org, scrape brand URL, analyze voice, write brand guidance, seed credits
   */
  async prepareBrand(
    leadId: string,
    organizationId: string,
    dto: PrepareBrandDto,
  ): Promise<{ success: boolean; brandId: string; organizationId: string }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.email) {
      throw new BadRequestException(
        'Lead must have an email address for proactive onboarding',
      );
    }

    if (
      lead.proactiveStatus !== ProactiveOnboardingStatus.NONE &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.BRAND_READY
    ) {
      throw new BadRequestException(
        `Cannot prepare brand in status "${lead.proactiveStatus}"`,
      );
    }

    // Update status to preparing
    await this.updateLeadStatus(
      leadId,
      organizationId,
      ProactiveOnboardingStatus.BRAND_PREPARING,
      { brandUrl: dto.brandUrl },
    );

    try {
      // 1. Validate URL
      const validation = this.brandScraperService.validateUrl(dto.brandUrl);
      if (!validation.isValid) {
        throw new BadRequestException(`Invalid URL: ${validation.error}`);
      }

      // 2. Create shadow organization
      let shadowOrg;
      if (lead.proactiveOrganization) {
        // Reuse existing shadow org
        shadowOrg = await this.organizationsService.findOne({
          _id: new Types.ObjectId(lead.proactiveOrganization),
        });
      }

      if (!shadowOrg) {
        // Create a placeholder user for the shadow org (will be transferred on signup)
        const placeholderUser = await this.usersService.create({
          email: lead.email,
          firstName: lead.name.split(' ')[0],
          handle: `proactive-${Date.now()}`,
          isInvited: true,
          lastName: lead.name.split(' ').slice(1).join(' ') || undefined,
        });

        shadowOrg = await this.organizationsService.create({
          isProactiveOnboarding: true,
          isSelected: false,
          label: dto.brandName || lead.company || lead.name,
          onboardingCompleted: true,
          user: new Types.ObjectId(placeholderUser._id),
        });

        // Create member record (inactive until signup)
        await this.membersService.create({
          isActive: false,
          organization: new Types.ObjectId(shadowOrg._id),
          user: new Types.ObjectId(placeholderUser._id),
        });
      }

      const shadowOrgId = new Types.ObjectId(shadowOrg._id);

      // 3. Scrape brand
      this.loggerService.log('Proactive onboarding: scraping brand', {
        leadId,
        url: dto.brandUrl,
      });

      const detectedSources = this.brandScraperService.detectUrlType(
        dto.brandUrl,
      );
      let scrapedData: IScrapedBrandData;

      if (detectedSources.websiteUrl) {
        scrapedData = await this.brandScraperService.scrapeWebsite(
          dto.brandUrl,
        );
      } else if (detectedSources.linkedinUrl) {
        const linkedinData = await this.brandScraperService.scrapeLinkedIn(
          detectedSources.linkedinUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: linkedinData.companyName,
          description: linkedinData.description,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: linkedinData.logoUrl,
          metaDescription: linkedinData.description,
          ogImage: linkedinData.coverImageUrl,
          primaryColor: undefined,
          scrapedAt: linkedinData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else if (detectedSources.xProfileUrl) {
        const xData = await this.brandScraperService.scrapeXProfile(
          detectedSources.xProfileUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: xData.displayName,
          description: xData.bio,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: xData.profileImageUrl,
          metaDescription: xData.bio,
          ogImage: xData.profileImageUrl,
          primaryColor: undefined,
          scrapedAt: xData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else {
        scrapedData = await this.brandScraperService.scrapeWebsite(
          dto.brandUrl,
        );
      }

      // 4. Analyze brand voice
      this.loggerService.log('Proactive onboarding: analyzing brand voice', {
        leadId,
      });
      const brandVoice =
        await this.masterPromptGeneratorService.analyzeBrandVoice(scrapedData, {
          organizationId: shadowOrgId.toString(),
          userId: shadowOrg.user.toString(),
        });

      const extractedData: IExtractedBrandData = {
        ...scrapedData,
        brandVoice,
      };

      // 5. Create brand in shadow org
      const brandLabel =
        dto.brandName || scrapedData.companyName || lead.company || lead.name;

      const brand = await this.brandsService.create({
        description: scrapedData.description,
        fontFamily: scrapedData.fontFamily,
        isSelected: true,
        label: brandLabel,
        organization: shadowOrgId,
        primaryColor: scrapedData.primaryColor,
        secondaryColor: scrapedData.secondaryColor,
        text: this.buildBrandSystemPrompt(scrapedData, dto),
        user: shadowOrg.user,
      });

      await this.brandsService.patch(brand._id.toString(), {
        agentConfig: {
          enabledSkills: [],
          voice: brandVoice
            ? {
                audience: brandVoice.audience
                  ? brandVoice.audience
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : [],
                hashtags: brandVoice.hashtags ?? [],
                style: brandVoice.voice,
                taglines: brandVoice.taglines ?? [],
                tone: brandVoice.tone,
                values: brandVoice.values ?? [],
              }
            : undefined,
        },
      });

      // 6. Seed credits
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        shadowOrg._id.toString(),
        PROACTIVE_ONBOARDING_CREDITS,
        'proactive-onboarding',
        `Proactive onboarding credits for lead ${lead.name}`,
        new Date(Date.now() + PROACTIVE_CREDITS_EXPIRY_MS),
      );

      // 7. Update lead with references
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.BRAND_READY,
        {
          proactiveBrand: new Types.ObjectId(brand._id),
          proactiveOrganization: shadowOrgId,
        },
      );

      this.loggerService.log('Proactive onboarding: brand prepared', {
        brandId: brand._id,
        leadId,
        shadowOrgId: shadowOrg._id,
      });

      return {
        brandId: brand._id.toString(),
        organizationId: shadowOrg._id.toString(),
        success: true,
      };
    } catch (error: unknown) {
      // Revert status on failure
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.NONE,
      );

      this.loggerService.error(
        'Proactive onboarding: prepareBrand failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to prepare brand',
          title: 'Brand Preparation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Step 2: Generate content using BatchGenerationService
   */
  async generateContent(
    leadId: string,
    organizationId: string,
    dto: CrmGenerateContentDto,
  ): Promise<{ success: boolean; batchId: string }> {
    const lead = await this.getLead(leadId, organizationId);

    if (lead.proactiveStatus !== ProactiveOnboardingStatus.BRAND_READY) {
      throw new BadRequestException(
        'Brand must be prepared before generating content',
      );
    }

    if (!lead.proactiveOrganization || !lead.proactiveBrand) {
      throw new BadRequestException(
        'Shadow organization and brand must exist before generating content',
      );
    }

    await this.updateLeadStatus(
      leadId,
      organizationId,
      ProactiveOnboardingStatus.CONTENT_GENERATING,
    );

    try {
      const shadowOrgId = lead.proactiveOrganization.toString();
      const brandId = lead.proactiveBrand.toString();
      const count = dto.count || 10;

      // Find the shadow org to get user ID
      const shadowOrg = await this.organizationsService.findOne({
        _id: new Types.ObjectId(shadowOrgId),
      });

      if (!shadowOrg) {
        throw new NotFoundException('Shadow organization not found');
      }

      // Create date range: starting tomorrow, spread over 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 31);

      const batch = await this.batchGenerationService.createBatch(
        {
          brandId,
          count,
          dateRange: {
            end: endDate.toISOString(),
            start: startDate.toISOString(),
          },
          platforms: dto.platforms || ['instagram', 'twitter'],
          topics: dto.topics || [],
        },
        shadowOrg.user.toString(),
        shadowOrgId,
      );

      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.READY,
        { proactiveBatchId: batch.id },
      );

      this.loggerService.log('Proactive onboarding: content generated', {
        batchId: batch.id,
        count,
        leadId,
      });

      return { batchId: batch.id, success: true };
    } catch (error: unknown) {
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.BRAND_READY,
      );

      this.loggerService.error(
        'Proactive onboarding: generateContent failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to generate content',
          title: 'Content Generation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Step 3: Send Clerk invitation to lead
   */
  async sendInvitation(
    leadId: string,
    organizationId: string,
    dto: SendInvitationDto,
  ): Promise<{ success: boolean; invitedAt: Date }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.email) {
      throw new BadRequestException(
        'Lead must have an email address to send invitation',
      );
    }

    if (
      lead.proactiveStatus !== ProactiveOnboardingStatus.CONTENT_READY &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.READY &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.INVITED
    ) {
      throw new BadRequestException(
        'Content must be generated before sending invitation',
      );
    }

    if (!lead.proactiveOrganization) {
      throw new BadRequestException('Shadow organization must exist');
    }

    try {
      // Find the placeholder user in the shadow org
      const shadowOrg = await this.organizationsService.findOne({
        _id: new Types.ObjectId(lead.proactiveOrganization),
      });

      if (!shadowOrg) {
        throw new NotFoundException('Shadow organization not found');
      }

      // Send Clerk invitation with proactive onboarding metadata
      const redirectUrl = this.getProactiveRedirectUrl();

      await this.clerkService.createInvitation(lead.email, redirectUrl, {
        isProactiveOnboarding: true,
        leadId,
        organizationId: lead.proactiveOrganization.toString(),
        userId: shadowOrg.user.toString(),
      });

      const invitedAt = new Date();

      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.INVITED,
        { invitedAt },
      );

      this.loggerService.log('Proactive onboarding: invitation sent', {
        email: lead.email,
        leadId,
      });

      return { invitedAt, success: true };
    } catch (error: unknown) {
      this.loggerService.error(
        'Proactive onboarding: sendInvitation failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to send invitation',
          title: 'Invitation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get current preparation status for a lead
   */
  async getPreparationStatus(
    leadId: string,
    organizationId: string,
  ): Promise<IProactivePreparationStatus> {
    const lead = await this.getLead(leadId, organizationId);

    const result: IProactivePreparationStatus = {
      generatedAssetCount: 0,
      inviteEligible: false,
      prepPercent: this.getPrepPercent(lead.proactiveStatus),
      prepStage: this.getPrepStage(lead.proactiveStatus),
      proactiveStatus: lead.proactiveStatus,
    };

    // Fetch brand details if available
    if (lead.proactiveBrand) {
      const brand = await this.brandsService.findOne(
        { _id: new Types.ObjectId(lead.proactiveBrand), isDeleted: false },
        'none',
      );

      if (brand) {
        result.brand = {
          colors: [brand.primaryColor, brand.secondaryColor].filter(
            Boolean,
          ) as string[],
          id: brand._id.toString(),
          name: brand.label || '',
          voiceTone: brand.description || undefined,
        };
      }
    }

    // Fetch batch details if available
    if (lead.proactiveBatchId && lead.proactiveOrganization) {
      try {
        const batch = await this.batchGenerationService.getBatch(
          lead.proactiveBatchId,
          lead.proactiveOrganization.toString(),
        );

        if (batch) {
          result.generatedAssetCount = batch.completedItems ?? 0;
          result.batch = {
            completedPosts: batch.completedItems ?? 0,
            id: batch.id,
            platforms: batch.platforms ?? [],
            totalPosts: batch.totalItems ?? 0,
          };
        }
      } catch {
        // Batch may not exist yet or may have been cleaned up
      }
    }

    // Fetch invitation details
    if (lead.invitedAt && lead.email) {
      result.invitation = {
        email: lead.email,
        invitedAt: lead.invitedAt.toISOString(),
      };
    }

    if (lead.claimedAt) {
      result.claimedAt = lead.claimedAt.toISOString();
    }

    if (lead.paymentMadeAt) {
      result.paymentMadeAt = lead.paymentMadeAt.toISOString();
    }

    // Fetch organization details
    if (lead.proactiveOrganization) {
      const org = await this.organizationsService.findOne({
        _id: new Types.ObjectId(lead.proactiveOrganization),
      });

      if (org) {
        result.organization = {
          id: org._id.toString(),
          label: org.label,
        };
      }
    }

    result.inviteEligible = this.isInviteEligible(lead.proactiveStatus);

    if (
      result.proactiveStatus === ProactiveOnboardingStatus.READY &&
      result.generatedAssetCount === 0 &&
      result.batch
    ) {
      result.generatedAssetCount = result.batch.completedPosts;
    }

    return result;
  }

  async getWorkspaceSummary(
    leadId: string,
    organizationId: string,
  ): Promise<{
    success: boolean;
    proactiveStatus: ProactiveOnboardingStatus;
    prepPercent: number;
    prepStage: string;
    brand?: IProactivePreparationStatus['brand'];
    organization?: IProactivePreparationStatus['organization'];
    outputs: unknown[];
    summary: string;
  }> {
    const lead = await this.getLead(leadId, organizationId);
    const status = await this.getPreparationStatus(leadId, organizationId);
    const outputs = await this.getLeadOutputs(lead);

    return {
      brand: status.brand,
      organization: status.organization,
      outputs,
      prepPercent: status.prepPercent ?? 0,
      prepStage: status.prepStage ?? 'not_started',
      proactiveStatus: lead.proactiveStatus,
      success: true,
      summary: this.buildWorkspaceSummary(status, outputs.length),
    };
  }

  async claimWorkspace(
    leadIdOrShadowOrgId: string,
    organizationIdOrUserId: string,
    userIdArg?: string,
  ): Promise<{
    success: boolean;
    proactiveStatus: ProactiveOnboardingStatus;
    outputs: unknown[];
    brand?: IProactivePreparationStatus['brand'];
    organization?: IProactivePreparationStatus['organization'];
    prepPercent: number;
    prepStage: string;
    claimedAt?: Date;
    summary: string;
  }> {
    const claimContext = userIdArg
      ? await this.getLeadClaimContext(
          leadIdOrShadowOrgId,
          organizationIdOrUserId,
          userIdArg,
        )
      : await this.getShadowOrgClaimContext(
          leadIdOrShadowOrgId,
          organizationIdOrUserId,
        );

    const { lead, organizationId } = claimContext;

    if (!lead.proactiveOrganization) {
      throw new BadRequestException('Shadow organization must exist');
    }

    if (
      lead.proactiveStatus !== ProactiveOnboardingStatus.INVITED &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.STARTED &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.PAYMENT_MADE &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.CONVERTED
    ) {
      throw new BadRequestException('Lead must be invited before claiming');
    }

    let claimedAt: Date | undefined;
    if (lead.proactiveStatus === ProactiveOnboardingStatus.INVITED) {
      claimedAt = new Date();
      await this.updateLeadStatus(
        lead._id.toString(),
        organizationId,
        ProactiveOnboardingStatus.STARTED,
        { claimedAt },
      );
      lead.proactiveStatus = ProactiveOnboardingStatus.STARTED;
      lead.claimedAt = claimedAt;
    }

    const workspace = userIdArg
      ? await this.getWorkspaceSummary(lead._id.toString(), organizationId)
      : undefined;
    const fallbackStatus =
      workspace ??
      (await this.getPreparationStatus(lead._id.toString(), organizationId));
    const outputs = workspace?.outputs ?? (await this.getLeadOutputs(lead));
    const summary =
      workspace?.summary ??
      this.buildWorkspaceSummary(fallbackStatus, outputs.length);

    return {
      brand: fallbackStatus.brand,
      claimedAt,
      organization: fallbackStatus.organization,
      outputs,
      prepPercent: fallbackStatus.prepPercent ?? 0,
      prepStage: fallbackStatus.prepStage ?? 'ready',
      proactiveStatus: ProactiveOnboardingStatus.STARTED,
      success: true,
      summary,
    };
  }

  async markPaymentMade(
    leadIdOrShadowOrgId: string,
    organizationId?: string,
  ): Promise<{ success: boolean; paymentMadeAt: Date }> {
    const lead = organizationId
      ? await this.getLead(leadIdOrShadowOrgId, organizationId)
      : await this.getLeadByShadowOrganization(leadIdOrShadowOrgId);

    if (
      lead.proactiveStatus !== ProactiveOnboardingStatus.STARTED &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.PAYMENT_MADE &&
      lead.proactiveStatus !== ProactiveOnboardingStatus.CONVERTED
    ) {
      throw new BadRequestException(
        'Lead must be started before payment can be recorded',
      );
    }

    const paymentMadeAt = new Date();
    const leadOrganizationId = organizationId ?? lead.organization.toString();

    await this.updateLeadStatus(
      lead._id.toString(),
      leadOrganizationId,
      ProactiveOnboardingStatus.PAYMENT_MADE,
      { paymentMadeAt },
    );

    return { paymentMadeAt, success: true };
  }

  /**
   * Get posts generated for a lead's shadow org (for admin review)
   */
  async reviewContent(
    leadId: string,
    organizationId: string,
  ): Promise<{ posts: unknown[] }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.proactiveOrganization) {
      return { posts: [] };
    }

    const posts = await this.postsService.find({
      isDeleted: false,
      organization: new Types.ObjectId(lead.proactiveOrganization),
    });

    return { posts };
  }

  // === Private helpers ===

  private async getLead(
    leadId: string,
    organizationId: string,
  ): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findOne({
        _id: leadId,
        isDeleted: false,
        organization: organizationId,
      })
      .exec();

    if (!lead) {
      throw new NotFoundException(`Lead "${leadId}" not found`);
    }

    return lead;
  }

  private async getLeadByShadowOrganization(
    shadowOrganizationId: string,
  ): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findOne({
        isDeleted: false,
        proactiveOrganization: shadowOrganizationId,
      })
      .exec();

    if (!lead) {
      throw new NotFoundException(
        `Lead for shadow organization "${shadowOrganizationId}" not found`,
      );
    }

    return lead;
  }

  private async getLeadClaimContext(
    leadId: string,
    organizationId: string,
    _userId: string,
  ): Promise<{ lead: LeadDocument; organizationId: string }> {
    return {
      lead: await this.getLead(leadId, organizationId),
      organizationId,
    };
  }

  private async getShadowOrgClaimContext(
    shadowOrganizationId: string,
    _userId: string,
  ): Promise<{ lead: LeadDocument; organizationId: string }> {
    const lead = await this.getLeadByShadowOrganization(shadowOrganizationId);

    return {
      lead,
      organizationId: lead.organization.toString(),
    };
  }

  private async updateLeadStatus(
    leadId: string,
    organizationId: string,
    status: ProactiveOnboardingStatus,
    extraFields?: Record<string, unknown>,
  ): Promise<void> {
    await this.leadModel
      .findOneAndUpdate(
        { _id: leadId, isDeleted: false, organization: organizationId },
        { $set: { proactiveStatus: status, ...extraFields } },
      )
      .exec();
  }

  private getProactiveRedirectUrl(): string | undefined {
    const appUrl = this.configService.get<string>('GENFEEDAI_APP_URL');

    if (!appUrl) {
      return undefined;
    }

    return `${appUrl.replace(/\/$/, '')}/onboarding/proactive`;
  }

  private getPrepStage(status: ProactiveOnboardingStatus): string {
    switch (status) {
      case ProactiveOnboardingStatus.BRAND_PREPARING:
        return 'researching_brand';
      case ProactiveOnboardingStatus.BRAND_READY:
        return 'brand_ready';
      case ProactiveOnboardingStatus.CONTENT_GENERATING:
        return 'generating_outputs';
      case ProactiveOnboardingStatus.READY:
      case ProactiveOnboardingStatus.INVITED:
      case ProactiveOnboardingStatus.STARTED:
      case ProactiveOnboardingStatus.PAYMENT_MADE:
      case ProactiveOnboardingStatus.CONVERTED:
        return 'ready';
      default:
        return 'not_started';
    }
  }

  private getPrepPercent(status: ProactiveOnboardingStatus): number {
    switch (status) {
      case ProactiveOnboardingStatus.BRAND_PREPARING:
        return 25;
      case ProactiveOnboardingStatus.BRAND_READY:
        return 55;
      case ProactiveOnboardingStatus.CONTENT_GENERATING:
        return 80;
      case ProactiveOnboardingStatus.READY:
      case ProactiveOnboardingStatus.INVITED:
      case ProactiveOnboardingStatus.STARTED:
      case ProactiveOnboardingStatus.PAYMENT_MADE:
      case ProactiveOnboardingStatus.CONVERTED:
        return 100;
      default:
        return 0;
    }
  }

  private isInviteEligible(status: ProactiveOnboardingStatus): boolean {
    return [
      ProactiveOnboardingStatus.READY,
      ProactiveOnboardingStatus.INVITED,
      ProactiveOnboardingStatus.STARTED,
      ProactiveOnboardingStatus.PAYMENT_MADE,
      ProactiveOnboardingStatus.CONVERTED,
    ].includes(status);
  }

  private async getLeadOutputs(lead: LeadDocument): Promise<unknown[]> {
    if (!lead.proactiveOrganization) {
      return [];
    }

    const posts = await this.postsService.find({
      isDeleted: false,
      organization: new Types.ObjectId(lead.proactiveOrganization),
    });

    return posts.slice(0, 3);
  }

  private buildWorkspaceSummary(
    status: Pick<
      IProactivePreparationStatus,
      'brand' | 'organization' | 'generatedAssetCount'
    >,
    outputCount: number,
  ): string {
    const parts = [
      status.organization?.label
        ? `${status.organization.label} is prebuilt`
        : 'Your workspace is prebuilt',
      status.brand?.name ? `with ${status.brand.name} context` : undefined,
      outputCount > 0 ? `and ${outputCount} starter outputs ready` : undefined,
    ].filter(Boolean);

    return `${parts.join(' ')}.`;
  }

  private buildBrandSystemPrompt(
    scrapedData: IScrapedBrandData,
    dto: PrepareBrandDto,
  ): string {
    const parts: string[] = [];

    if (scrapedData.companyName) {
      parts.push(`You are creating content for ${scrapedData.companyName}.`);
    }

    if (scrapedData.tagline) {
      parts.push(`Brand tagline: "${scrapedData.tagline}"`);
    }

    if (scrapedData.aboutText) {
      parts.push(`About the brand: ${scrapedData.aboutText}`);
    }

    if (dto.industry) {
      parts.push(`Industry: ${dto.industry}`);
    }

    if (dto.targetAudience) {
      parts.push(`Target audience: ${dto.targetAudience}`);
    }

    return parts.join('\n\n');
  }
}
