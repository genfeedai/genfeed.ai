vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { CrmController } from '@api/endpoints/admin/crm/crm.controller';
import { CrmService } from '@api/endpoints/admin/crm/crm.service';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import type { User } from '@clerk/backend';
import { LeadStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('CrmController', () => {
  let controller: CrmController;
  let crmService: vi.Mocked<CrmService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser: User = {
    id: 'clerk_user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439099',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/admin/crm',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CrmController],
      providers: [
        {
          provide: ProactiveOnboardingService,
          useValue: {
            triggerOnboardingEmail: vi.fn(),
            triggerWelcomeSequence: vi.fn(),
          },
        },
        {
          provide: CrmService,
          useValue: {
            createAlignmentRule: vi.fn(),
            createCompany: vi.fn(),
            createCostRecord: vi.fn(),
            createLead: vi.fn(),
            createLeadActivity: vi.fn(),
            createTask: vi.fn(),
            deleteCompany: vi.fn(),
            deleteLead: vi.fn(),
            deleteTask: vi.fn(),
            getAlignmentRules: vi.fn(),
            getAlignmentSummary: vi.fn(),
            getAnalytics: vi.fn(),
            getCompanies: vi.fn(),
            getCompany: vi.fn(),
            getCostRecords: vi.fn(),
            getLead: vi.fn(),
            getLeadActivities: vi.fn(),
            getLeads: vi.fn(),
            getMargins: vi.fn(),
            getMonthlyMargins: vi.fn(),
            getRevenueRecords: vi.fn(),
            getTasks: vi.fn(),
            updateAlignmentRule: vi.fn(),
            updateCompany: vi.fn(),
            updateLead: vi.fn(),
            updateTask: vi.fn(),
            validateAlignment: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CrmController>(CrmController);
    crmService = module.get(CrmService);
    _loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Leads', () => {
    describe('listLeads', () => {
      it('should return all leads without status filter', async () => {
        const mockLeads = [
          { _id: 'lead1', name: 'John Doe', status: LeadStatus.NEW },
          { _id: 'lead2', name: 'Jane Smith', status: LeadStatus.CONTACTED },
        ];

        crmService.getLeads.mockResolvedValue(mockLeads as never);

        const result = await controller.listLeads(
          mockRequest,
          undefined,
          mockUser,
        );

        expect(crmService.getLeads).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          undefined,
        );
        expect(result).toBeDefined();
      });

      it('should return filtered leads by status', async () => {
        const mockLeads = [
          { _id: 'lead1', name: 'John Doe', status: LeadStatus.QUALIFIED },
        ];

        crmService.getLeads.mockResolvedValue(mockLeads as never);

        const result = await controller.listLeads(
          mockRequest,
          LeadStatus.QUALIFIED,
          mockUser,
        );

        expect(crmService.getLeads).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          LeadStatus.QUALIFIED,
        );
        expect(result).toBeDefined();
      });
    });

    describe('getLead', () => {
      it('should return a specific lead', async () => {
        const mockLead = {
          _id: 'lead1',
          email: 'test@example.com',
          name: 'Test Lead',
        };

        crmService.getLead.mockResolvedValue(mockLead as never);

        const result = await controller.getLead(mockRequest, 'lead1', mockUser);

        expect(crmService.getLead).toHaveBeenCalledWith(
          'lead1',
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });

      it('should handle not found error', async () => {
        crmService.getLead.mockRejectedValue(
          new NotFoundException('Lead "lead999" not found'),
        );

        await expect(
          controller.getLead(mockRequest, 'lead999', mockUser),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('createLead', () => {
      it('should create a lead successfully', async () => {
        const dto = {
          email: 'new@example.com',
          name: 'New Lead',
          status: LeadStatus.NEW,
        };

        const mockCreated = { _id: 'lead_new', ...dto };
        crmService.createLead.mockResolvedValue(mockCreated as never);

        const result = await controller.createLead(
          mockRequest,
          dto as never,
          mockUser,
        );

        expect(crmService.createLead).toHaveBeenCalledWith(
          expect.objectContaining({
            ...dto,
            organization: expect.anything(),
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('updateLead', () => {
      it('should update a lead successfully', async () => {
        const dto = { status: LeadStatus.QUALIFIED };
        const mockUpdated = {
          _id: 'lead1',
          name: 'Test',
          status: LeadStatus.QUALIFIED,
        };

        crmService.updateLead.mockResolvedValue(mockUpdated as never);

        const result = await controller.updateLead(
          mockRequest,
          'lead1',
          dto as never,
          mockUser,
        );

        expect(crmService.updateLead).toHaveBeenCalledWith(
          'lead1',
          '507f1f77bcf86cd799439012',
          dto,
        );
        expect(result).toBeDefined();
      });
    });

    describe('deleteLead', () => {
      it('should soft-delete a lead', async () => {
        const mockDeleted = {
          _id: 'lead1',
          isDeleted: true,
          name: 'Deleted Lead',
        };

        crmService.deleteLead.mockResolvedValue(mockDeleted as never);

        const result = await controller.deleteLead(
          mockRequest,
          'lead1',
          mockUser,
        );

        expect(crmService.deleteLead).toHaveBeenCalledWith(
          'lead1',
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });

    describe('createLeadActivity', () => {
      it('uses the canonical database user id for activity attribution', async () => {
        const dto = { description: 'Reached out on email', type: 'note' };
        const mockActivity = { _id: 'activity-1', ...dto };

        crmService.createLeadActivity.mockResolvedValue(mockActivity as never);

        const result = await controller.createLeadActivity(
          mockRequest,
          'lead1',
          dto as never,
          mockUser,
        );

        expect(crmService.createLeadActivity).toHaveBeenCalledWith(
          'lead1',
          '507f1f77bcf86cd799439012',
          '507f1f77bcf86cd799439099',
          dto,
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Companies', () => {
    describe('listCompanies', () => {
      it('should return all companies', async () => {
        const mockCompanies = [
          { _id: 'comp1', name: 'Company A' },
          { _id: 'comp2', name: 'Company B' },
        ];

        crmService.getCompanies.mockResolvedValue(mockCompanies as never);

        const result = await controller.listCompanies(mockRequest, mockUser);

        expect(crmService.getCompanies).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });

    describe('createCompany', () => {
      it('should create a company successfully', async () => {
        const dto = { name: 'New Company' };
        const mockCreated = { _id: 'comp_new', ...dto };

        crmService.createCompany.mockResolvedValue(mockCreated as never);

        const result = await controller.createCompany(
          mockRequest,
          dto as never,
          mockUser,
        );

        expect(crmService.createCompany).toHaveBeenCalledWith(
          expect.objectContaining({
            ...dto,
            organization: expect.anything(),
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('updateCompany', () => {
      it('should update a company', async () => {
        const dto = { name: 'Updated Company' };
        const mockUpdated = { _id: 'comp1', ...dto };

        crmService.updateCompany.mockResolvedValue(mockUpdated as never);

        const result = await controller.updateCompany(
          mockRequest,
          'comp1',
          dto as never,
          mockUser,
        );

        expect(crmService.updateCompany).toHaveBeenCalledWith(
          'comp1',
          '507f1f77bcf86cd799439012',
          dto,
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Tasks', () => {
    describe('listTasks', () => {
      it('should return all tasks', async () => {
        const mockTasks = [
          { _id: 'task1', title: 'Follow up' },
          { _id: 'task2', title: 'Send proposal' },
        ];

        crmService.getTasks.mockResolvedValue(mockTasks as never);

        const result = await controller.listTasks(mockRequest, mockUser);

        expect(crmService.getTasks).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });

    describe('createTask', () => {
      it('should create a task', async () => {
        const dto = { dueDate: new Date(), title: 'New Task' };
        const mockCreated = { _id: 'task_new', ...dto };

        crmService.createTask.mockResolvedValue(mockCreated as never);

        const result = await controller.createTask(
          mockRequest,
          dto as never,
          mockUser,
        );

        expect(crmService.createTask).toHaveBeenCalledWith(
          expect.objectContaining({
            ...dto,
            organization: expect.anything(),
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('updateTask', () => {
      it('should update a task', async () => {
        const dto = { completed: true };
        const mockUpdated = { _id: 'task1', completed: true };

        crmService.updateTask.mockResolvedValue(mockUpdated as never);

        const result = await controller.updateTask(
          mockRequest,
          'task1',
          dto as never,
          mockUser,
        );

        expect(crmService.updateTask).toHaveBeenCalledWith(
          'task1',
          '507f1f77bcf86cd799439012',
          dto,
        );
        expect(result).toBeDefined();
      });
    });

    describe('deleteTask', () => {
      it('should soft-delete a task', async () => {
        const mockDeleted = { _id: 'task1', isDeleted: true };

        crmService.deleteTask.mockResolvedValue(mockDeleted as never);

        const result = await controller.deleteTask(
          mockRequest,
          'task1',
          mockUser,
        );

        expect(crmService.deleteTask).toHaveBeenCalledWith(
          'task1',
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Financial', () => {
    describe('listCosts', () => {
      it('should return all cost records', async () => {
        const mockCosts = [{ _id: 'cost1', amount: 100, category: 'model' }];

        crmService.getCostRecords.mockResolvedValue(mockCosts as never);

        const result = await controller.listCosts(mockRequest, mockUser);

        expect(crmService.getCostRecords).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });

    describe('createCost', () => {
      it('should create a cost record', async () => {
        const dto = { amount: 50, category: 'replicate' };
        const mockCreated = { _id: 'cost_new', ...dto };

        crmService.createCostRecord.mockResolvedValue(mockCreated as never);

        const result = await controller.createCost(
          mockRequest,
          dto as never,
          mockUser,
        );

        expect(crmService.createCostRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            ...dto,
            organization: expect.anything(),
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('listRevenue', () => {
      it('should return all revenue records', async () => {
        const mockRevenue = [
          { _id: 'rev1', amount: 1000, source: 'subscription' },
        ];

        crmService.getRevenueRecords.mockResolvedValue(mockRevenue as never);

        const result = await controller.listRevenue(mockRequest, mockUser);

        expect(crmService.getRevenueRecords).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
        );
        expect(result).toBeDefined();
      });
    });
  });

  describe('Analytics', () => {
    describe('getAnalytics', () => {
      it('should return analytics with default days', async () => {
        const mockAnalytics = {
          avgTimePerStage: [],
          funnel: [],
          sources: [],
          velocity: [],
        };

        crmService.getAnalytics.mockResolvedValue(mockAnalytics as never);

        const result = await controller.getAnalytics(
          mockRequest,
          undefined,
          mockUser,
        );

        expect(crmService.getAnalytics).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          30,
        );
        expect(result).toEqual({
          _id: 'analytics:507f1f77bcf86cd799439012:30',
          ...mockAnalytics,
        });
      });

      it('should return analytics with custom days', async () => {
        const mockAnalytics = {
          avgTimePerStage: [],
          funnel: [],
          sources: [],
          velocity: [],
        };

        crmService.getAnalytics.mockResolvedValue(mockAnalytics as never);

        const result = await controller.getAnalytics(
          mockRequest,
          '90',
          mockUser,
        );

        expect(crmService.getAnalytics).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          90,
        );
        expect(result).toEqual({
          _id: 'analytics:507f1f77bcf86cd799439012:90',
          ...mockAnalytics,
        });
      });
    });

    describe('getMargins', () => {
      it('should return margin summary', async () => {
        const mockMargins = { costs: 500, margin: 1500, revenue: 2000 };

        crmService.getMargins.mockResolvedValue(mockMargins as never);

        const result = await controller.getMargins(mockRequest, mockUser);

        expect(crmService.getMargins).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
        );
        expect(result).toEqual({
          _id: 'margins:507f1f77bcf86cd799439012',
          ...mockMargins,
        });
      });
    });

    describe('getMonthlyMargins', () => {
      it('should return monthly margins with default year', async () => {
        const mockMonthly = [
          {
            margin: 1000,
            marginPercentage: 50,
            modelsCost: 200,
            month: 'January',
            otherCost: 100,
            replicateCost: 300,
            revenue: 1600,
            totalCosts: 600,
          },
        ];

        crmService.getMonthlyMargins.mockResolvedValue(mockMonthly as never);

        const result = await controller.getMonthlyMargins(
          mockRequest,
          undefined,
          mockUser,
        );

        expect(crmService.getMonthlyMargins).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          new Date().getFullYear(),
        );
        expect(result).toEqual([
          {
            _id: `${new Date().getFullYear()}:January`,
            ...mockMonthly[0],
          },
        ]);
      });

      it('should return monthly margins with custom year', async () => {
        const mockMonthly: never[] = [];

        crmService.getMonthlyMargins.mockResolvedValue(mockMonthly as never);

        const _result = await controller.getMonthlyMargins(
          mockRequest,
          '2025',
          mockUser,
        );

        expect(crmService.getMonthlyMargins).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439012',
          2025,
        );
      });
    });
  });
});
