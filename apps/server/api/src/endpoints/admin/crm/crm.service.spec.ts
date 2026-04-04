import { CrmService } from '@api/endpoints/admin/crm/crm.service';
import { NotFoundException } from '@nestjs/common';

// Helper to create a chainable Mongoose query mock
function makeQuery(resolvedValue: unknown) {
  const q: Record<string, unknown> = {};
  q.sort = vi.fn().mockReturnValue(q);
  q.exec = vi.fn().mockResolvedValue(resolvedValue);
  return q;
}

function makeModel() {
  return {
    aggregate: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };
}

describe('CrmService', () => {
  let service: CrmService;
  let leadModel: ReturnType<typeof makeModel>;
  let leadActivityModel: ReturnType<typeof makeModel>;
  let alignmentRuleModel: ReturnType<typeof makeModel>;
  let companyModel: ReturnType<typeof makeModel>;
  let crmTaskModel: ReturnType<typeof makeModel>;
  let costRecordModel: ReturnType<typeof makeModel>;
  let revenueRecordModel: ReturnType<typeof makeModel>;
  let notificationsService: {
    sendCrmLeadOutreachEmail: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const ORG = 'org_123';
  const LEAD_ID = 'lead_abc';
  const COMPANY_ID = 'company_abc';

  beforeEach(() => {
    leadModel = makeModel();
    leadActivityModel = makeModel();
    alignmentRuleModel = makeModel();
    companyModel = makeModel();
    crmTaskModel = makeModel();
    costRecordModel = makeModel();
    revenueRecordModel = makeModel();
    notificationsService = { sendCrmLeadOutreachEmail: vi.fn() };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    service = new CrmService(
      leadModel as any,
      leadActivityModel as any,
      alignmentRuleModel as any,
      companyModel as any,
      crmTaskModel as any,
      costRecordModel as any,
      revenueRecordModel as any,
      notificationsService as any,
      loggerService as any,
    );
  });

  // ===== LEADS =====

  describe('getLeads', () => {
    it('returns leads for an organization', async () => {
      const leads = [{ _id: LEAD_ID, status: 'new' }];
      const q = makeQuery(leads);
      leadModel.find.mockReturnValue(q);

      const result = await service.getLeads(ORG);

      expect(leadModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: ORG,
      });
      expect(q.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(result).toBe(leads);
    });

    it('filters by status when provided', async () => {
      const q = makeQuery([]);
      leadModel.find.mockReturnValue(q);

      await service.getLeads(ORG, 'qualified' as any);

      expect(leadModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: ORG,
        status: 'qualified',
      });
    });
  });

  describe('getLead', () => {
    it('returns a lead when found', async () => {
      const lead = { _id: LEAD_ID };
      const q = makeQuery(lead);
      leadModel.findOne.mockReturnValue(q);

      const result = await service.getLead(LEAD_ID, ORG);

      expect(leadModel.findOne).toHaveBeenCalledWith({
        _id: LEAD_ID,
        isDeleted: false,
        organization: ORG,
      });
      expect(result).toBe(lead);
    });

    it('throws NotFoundException when lead is not found', async () => {
      const q = makeQuery(null);
      leadModel.findOne.mockReturnValue(q);

      await expect(service.getLead(LEAD_ID, ORG)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getLead(LEAD_ID, ORG)).rejects.toThrow(
        `Lead "${LEAD_ID}" not found`,
      );
    });
  });

  describe('createLead', () => {
    it('creates and returns a lead', async () => {
      const lead = { _id: LEAD_ID, name: 'Test Lead' };
      leadModel.create.mockResolvedValue(lead);

      const result = await service.createLead({ name: 'Test Lead' } as any);

      expect(leadModel.create).toHaveBeenCalledWith({ name: 'Test Lead' });
      expect(result).toBe(lead);
    });
  });

  describe('updateLead', () => {
    it('updates and returns the lead', async () => {
      const previous = { _id: LEAD_ID, status: 'new' };
      const updated = { _id: LEAD_ID, status: 'qualified' };
      leadModel.findOne.mockReturnValue(makeQuery(previous));
      const q = makeQuery(updated);
      leadModel.findOneAndUpdate.mockReturnValue(q);

      const result = await service.updateLead(LEAD_ID, ORG, {
        status: 'qualified' as any,
      });

      expect(leadModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: LEAD_ID, isDeleted: false, organization: ORG },
        { $set: { status: 'qualified' } },
        { returnDocument: 'after' },
      );
      expect(result).toBe(updated);
    });

    it('throws NotFoundException when lead not found for update', async () => {
      leadModel.findOne.mockReturnValue(
        makeQuery({ _id: LEAD_ID, status: 'new' }),
      );
      const q = makeQuery(null);
      leadModel.findOneAndUpdate.mockReturnValue(q);

      await expect(service.updateLead(LEAD_ID, ORG, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sends outreach when a lead is moved into contacted', async () => {
      const previous = {
        _id: LEAD_ID,
        email: 'lead@example.com',
        name: 'Lead Name',
        status: 'new',
      };
      const updated = {
        _id: LEAD_ID,
        email: 'lead@example.com',
        name: 'Lead Name',
        status: 'contacted',
      };

      leadModel.findOne.mockReturnValue(makeQuery(previous));
      leadModel.findOneAndUpdate
        .mockReturnValueOnce(makeQuery(updated))
        .mockReturnValueOnce(makeQuery(updated));
      leadActivityModel.create.mockResolvedValue(undefined);

      await service.updateLead(LEAD_ID, ORG, { status: 'contacted' as any });

      expect(
        notificationsService.sendCrmLeadOutreachEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: LEAD_ID,
          leadName: 'Lead Name',
          organizationId: ORG,
          to: 'lead@example.com',
        }),
      );
      expect(leadActivityModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'system',
          type: 'email',
        }),
      );
    });
  });

  describe('deleteLead', () => {
    it('soft-deletes a lead and returns it', async () => {
      const deleted = { _id: LEAD_ID, isDeleted: true };
      const q = makeQuery(deleted);
      leadModel.findOneAndUpdate.mockReturnValue(q);

      const result = await service.deleteLead(LEAD_ID, ORG);

      expect(leadModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: LEAD_ID, isDeleted: false, organization: ORG },
        { $set: { isDeleted: true } },
        { returnDocument: 'after' },
      );
      expect(result).toBe(deleted);
    });

    it('throws NotFoundException when lead not found for delete', async () => {
      const q = makeQuery(null);
      leadModel.findOneAndUpdate.mockReturnValue(q);

      await expect(service.deleteLead(LEAD_ID, ORG)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===== LEAD STATUS TRANSITIONS =====

  describe('lead status transitions (via updateLead)', () => {
    const statuses = [
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost',
    ];

    for (const status of statuses) {
      it(`transitions lead to status "${status}"`, async () => {
        leadModel.findOne.mockReturnValue(
          makeQuery({ _id: LEAD_ID, status: 'new' }),
        );
        const updated = { _id: LEAD_ID, status };
        const q = makeQuery(updated);
        leadModel.findOneAndUpdate.mockReturnValue(q);

        const result = await service.updateLead(LEAD_ID, ORG, {
          status: status as any,
        });

        expect(leadModel.findOneAndUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ _id: LEAD_ID }),
          { $set: { status } },
          expect.any(Object),
        );
        expect(result).toEqual(updated);
      });
    }
  });

  // ===== COMPANIES =====

  describe('getCompanies', () => {
    it('returns companies sorted by name', async () => {
      const companies = [{ _id: COMPANY_ID, name: 'Acme' }];
      const q = makeQuery(companies);
      companyModel.find.mockReturnValue(q);

      const result = await service.getCompanies(ORG);

      expect(companyModel.find).toHaveBeenCalledWith({
        isDeleted: false,
        organization: ORG,
      });
      expect(q.sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toBe(companies);
    });
  });

  describe('getCompany', () => {
    it('returns a company when found', async () => {
      const company = { _id: COMPANY_ID };
      const q = makeQuery(company);
      companyModel.findOne.mockReturnValue(q);

      const result = await service.getCompany(COMPANY_ID, ORG);

      expect(companyModel.findOne).toHaveBeenCalledWith({
        _id: COMPANY_ID,
        isDeleted: false,
        organization: ORG,
      });
      expect(result).toBe(company);
    });

    it('throws NotFoundException when company not found', async () => {
      const q = makeQuery(null);
      companyModel.findOne.mockReturnValue(q);

      await expect(service.getCompany(COMPANY_ID, ORG)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCompany(COMPANY_ID, ORG)).rejects.toThrow(
        `Company "${COMPANY_ID}" not found`,
      );
    });
  });

  describe('createCompany', () => {
    it('creates and returns a company', async () => {
      const company = { _id: COMPANY_ID, name: 'Acme' };
      companyModel.create.mockResolvedValue(company);

      const result = await service.createCompany({ name: 'Acme' } as any);

      expect(companyModel.create).toHaveBeenCalledWith({ name: 'Acme' });
      expect(result).toBe(company);
    });
  });

  describe('updateCompany', () => {
    it('updates and returns the company', async () => {
      const updated = { _id: COMPANY_ID, name: 'New Name' };
      const q = makeQuery(updated);
      companyModel.findOneAndUpdate.mockReturnValue(q);

      const result = await service.updateCompany(COMPANY_ID, ORG, {
        name: 'New Name',
      } as any);

      expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: COMPANY_ID, isDeleted: false, organization: ORG },
        { $set: { name: 'New Name' } },
        { returnDocument: 'after' },
      );
      expect(result).toBe(updated);
    });

    it('throws NotFoundException when company not found for update', async () => {
      const q = makeQuery(null);
      companyModel.findOneAndUpdate.mockReturnValue(q);

      await expect(service.updateCompany(COMPANY_ID, ORG, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===== ANALYTICS: getMargins =====

  describe('getMargins', () => {
    it('calculates costs, revenue and margin correctly', async () => {
      const costQ = { exec: vi.fn().mockResolvedValue([{ total: 300 }]) };
      const revQ = { exec: vi.fn().mockResolvedValue([{ total: 500 }]) };
      costRecordModel.aggregate.mockReturnValue(costQ);
      revenueRecordModel.aggregate.mockReturnValue(revQ);

      const result = await service.getMargins(ORG);

      expect(result).toEqual({ costs: 300, margin: 200, revenue: 500 });
    });

    it('returns zeros when no records exist', async () => {
      const costQ = { exec: vi.fn().mockResolvedValue([]) };
      const revQ = { exec: vi.fn().mockResolvedValue([]) };
      costRecordModel.aggregate.mockReturnValue(costQ);
      revenueRecordModel.aggregate.mockReturnValue(revQ);

      const result = await service.getMargins(ORG);

      expect(result).toEqual({ costs: 0, margin: 0, revenue: 0 });
    });
  });
});
