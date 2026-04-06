'use client';

import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import SocialLinks from '@components/social/SocialLinks';
import { ButtonVariant } from '@genfeedai/enums';
import type { ICrmCompany, ICrmLead } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AdminInputField,
  AdminSelectField,
  AdminTextareaField,
} from '@protected/crm/components/AdminFormFields';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  HiOutlineFunnel,
  HiOutlineTableCells,
  HiOutlineViewColumns,
  HiPlus,
} from 'react-icons/hi2';

// === Constants ===

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

const LEAD_SOURCES = [
  'inbound',
  'outbound',
  'referral',
  'organic',
  'paid',
  'event',
] as const;

const STATUS_COLORS = {
  contacted: 'warning',
  lost: 'error',
  negotiation: 'amber',
  new: 'info',
  proposal: 'purple',
  qualified: 'success',
  won: 'validated',
} as const;

const SOURCE_COLORS = {
  event: 'accent',
  inbound: 'success',
  organic: 'success',
  outbound: 'info',
  paid: 'amber',
  referral: 'purple',
} as const;

type ViewMode = 'pipeline' | 'table';

interface LeadFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  source: string;
  twitterHandle: string;
  instagramHandle: string;
  discordHandle: string;
  telegramHandle: string;
  contactDate: string;
  productOffering: string;
  notes: string;
  dealValue: string;
  currency: string;
}

const EMPTY_FORM: LeadFormData = {
  company: '',
  contactDate: '',
  currency: 'USD',
  dealValue: '',
  discordHandle: '',
  email: '',
  instagramHandle: '',
  name: '',
  notes: '',
  phone: '',
  productOffering: '',
  source: 'inbound',
  status: 'new',
  telegramHandle: '',
  twitterHandle: '',
};

// === Pipeline Column ===

function PipelineColumn({
  status,
  leads,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragOverStatus,
}: {
  status: string;
  leads: ICrmLead[];
  onDragStart: (leadId: string, fromStatus: string) => void;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDrop: (e: React.DragEvent, toStatus: string) => void;
  onDragEnd: () => void;
  dragOverStatus: string | null;
}) {
  const router = useRouter();

  return (
    <div
      className={`flex-1 min-w-skill-col bg-white/[0.02] border border-white/[0.08] rounded-lg p-3 transition-colors ${
        dragOverStatus === status ? 'border-primary/50 bg-primary/5' : ''
      }`}
      onDragOver={(e) => onDragOver(e, status)}
      onDrop={(e) => onDrop(e, status)}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium capitalize">{status}</span>
        <Badge
          variant={
            STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'default'
          }
          value={leads.length}
        />
      </div>
      <div className="flex flex-col gap-2">
        {leads.map((lead) => (
          <div
            key={lead.id}
            draggable
            onDragStart={() => onDragStart(lead.id, lead.status)}
            onDragEnd={onDragEnd}
            onClick={() => router.push(`/crm/leads/${lead.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                router.push(`/crm/leads/${lead.id}`);
              }
            }}
            role="button"
            tabIndex={0}
            className="bg-white/[0.04] border border-white/[0.08] rounded p-3 cursor-grab active:cursor-grabbing hover:border-white/[0.15] transition-colors"
          >
            <div className="font-medium text-sm truncate">{lead.name}</div>
            {lead.email && (
              <div className="text-xs text-foreground/50 truncate mt-1">
                {lead.email}
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <Badge
                variant={
                  STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ??
                  'default'
                }
              >
                {lead.status}
              </Badge>
              <SocialLinks
                twitterHandle={lead.twitterHandle}
                instagramHandle={lead.instagramHandle}
                discordHandle={lead.discordHandle}
                telegramHandle={lead.telegramHandle}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Lead Form Modal ===

function LeadFormModal({
  open,
  onOpenChange,
  formData,
  setFormData,
  companies,
  onSubmit,
  onDelete,
  isEditing,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: LeadFormData;
  setFormData: (data: LeadFormData) => void;
  companies: ICrmCompany[];
  onSubmit: () => void;
  onDelete?: () => void;
  isEditing: boolean;
  isSaving: boolean;
}) {
  const updateField = (field: keyof LeadFormData, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Lead' : 'Add Lead'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <AdminInputField
            id="lead-name"
            label="Name"
            required
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Lead name"
          />
          <AdminInputField
            id="lead-email"
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="email@example.com"
          />
          <AdminInputField
            id="lead-phone"
            label="Phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="+1 (555) 000-0000"
          />
          <AdminSelectField
            id="lead-company"
            label="Company"
            value={formData.company}
            onChange={(e) => updateField('company', e.target.value)}
          >
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminSelectField>
          <AdminSelectField
            id="lead-status"
            label="Status"
            value={formData.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </AdminSelectField>
          <AdminSelectField
            id="lead-source"
            label="Source"
            value={formData.source}
            onChange={(e) => updateField('source', e.target.value)}
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </AdminSelectField>
          <AdminInputField
            id="lead-deal-value"
            label="Deal Value"
            type="number"
            value={formData.dealValue}
            onChange={(e) => updateField('dealValue', e.target.value)}
            placeholder="0"
          />
          <AdminInputField
            id="lead-currency"
            label="Currency"
            value={formData.currency}
            onChange={(e) => updateField('currency', e.target.value)}
            placeholder="USD"
          />
          <AdminInputField
            id="lead-contact-date"
            label="Contact Date"
            type="date"
            value={formData.contactDate}
            onChange={(e) => updateField('contactDate', e.target.value)}
          />
          <AdminInputField
            id="lead-product-offering"
            label="Product Offering"
            value={formData.productOffering}
            onChange={(e) => updateField('productOffering', e.target.value)}
            placeholder="Product or service"
          />
          <AdminInputField
            id="lead-twitter"
            label="Twitter"
            value={formData.twitterHandle}
            onChange={(e) => updateField('twitterHandle', e.target.value)}
            placeholder="@handle"
          />
          <AdminInputField
            id="lead-instagram"
            label="Instagram"
            value={formData.instagramHandle}
            onChange={(e) => updateField('instagramHandle', e.target.value)}
            placeholder="@handle"
          />
          <AdminInputField
            id="lead-discord"
            label="Discord"
            value={formData.discordHandle}
            onChange={(e) => updateField('discordHandle', e.target.value)}
            placeholder="username#0000"
          />
          <AdminInputField
            id="lead-telegram"
            label="Telegram"
            value={formData.telegramHandle}
            onChange={(e) => updateField('telegramHandle', e.target.value)}
            placeholder="@handle"
          />
          <AdminTextareaField
            id="lead-notes"
            containerClassName="col-span-2"
            label="Notes"
            className="min-h-textarea-lg"
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Additional notes..."
          />
        </div>
        <DialogFooter>
          {isEditing && onDelete && (
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={onDelete}
            />
          )}
          <Button
            label={isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            onClick={onSubmit}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === Main Component ===

export default function CrmLeadsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<ICrmLead | null>(null);
  const [formData, setFormData] = useState<LeadFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const draggedRef = useRef<{ leadId: string; fromStatus: string } | null>(
    null,
  );

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: leads,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<ICrmLead[]>(
    async () => {
      const service = await getCrmService();
      return service.getLeads();
    },
    {
      defaultValue: [],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/leads failed', error);
      },
    },
  );

  const { data: companies } = useResource<ICrmCompany[]>(
    async () => {
      const service = await getCrmService();
      return service.getCompanies();
    },
    {
      defaultValue: [],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/companies failed', error);
      },
    },
  );

  // Group leads by status for pipeline view
  const leadsByStatus = useMemo(() => {
    const grouped: Record<string, ICrmLead[]> = {};
    for (const status of LEAD_STATUSES) {
      grouped[status] = leads.filter((l) => l.status === status);
    }
    return grouped;
  }, [leads]);

  const openCreateModal = useCallback(() => {
    setEditingLead(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const _openEditModal = useCallback((lead: ICrmLead) => {
    setEditingLead(lead);
    setFormData({
      company:
        typeof lead.company === 'string'
          ? lead.company
          : (lead.company?.id ?? lead.companyRef ?? ''),
      contactDate: lead.contactDate ?? '',
      currency: lead.currency ?? 'USD',
      dealValue: lead.dealValue?.toString() ?? '',
      discordHandle: lead.discordHandle ?? '',
      email: lead.email ?? '',
      instagramHandle: lead.instagramHandle ?? '',
      name: lead.name,
      notes: lead.notes ?? '',
      phone: lead.phone ?? '',
      productOffering: lead.productOffering ?? '',
      source: lead.source ?? 'inbound',
      status: lead.status,
      telegramHandle: lead.telegramHandle ?? '',
      twitterHandle: lead.twitterHandle ?? '',
    });
    setModalOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.name.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      const service = await getCrmService();
      const payload: Partial<ICrmLead> = {
        companyRef: formData.company || undefined,
        contactDate: formData.contactDate || undefined,
        currency: formData.currency || undefined,
        dealValue: formData.dealValue ? Number(formData.dealValue) : undefined,
        discordHandle: formData.discordHandle || undefined,
        email: formData.email || undefined,
        instagramHandle: formData.instagramHandle || undefined,
        name: formData.name,
        notes: formData.notes || undefined,
        phone: formData.phone || undefined,
        productOffering: formData.productOffering || undefined,
        source: formData.source || undefined,
        status: formData.status,
        telegramHandle: formData.telegramHandle || undefined,
        twitterHandle: formData.twitterHandle || undefined,
      };

      if (editingLead) {
        await service.updateLead(editingLead.id, payload);
        NotificationsService.getInstance().success('Lead updated');
      } else {
        await service.createLead(payload);
        NotificationsService.getInstance().success('Lead created');
      }
      setModalOpen(false);
      refresh();
    } catch (error) {
      logger.error('Save lead failed', error);
      NotificationsService.getInstance().error('Save lead');
    } finally {
      setIsSaving(false);
    }
  }, [formData, editingLead, getCrmService, refresh]);

  const handleDelete = useCallback(async () => {
    if (!editingLead) {
      return;
    }
    try {
      const service = await getCrmService();
      await service.deleteLead(editingLead.id);
      NotificationsService.getInstance().success('Lead deleted');
      setModalOpen(false);
      refresh();
    } catch (error) {
      logger.error('Delete lead failed', error);
      NotificationsService.getInstance().error('Delete lead');
    }
  }, [editingLead, getCrmService, refresh]);

  // Drag and drop handlers
  const handleDragStart = useCallback((leadId: string, fromStatus: string) => {
    draggedRef.current = { fromStatus, leadId };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(status);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, toStatus: string) => {
      e.preventDefault();
      setDragOverStatus(null);
      const dragged = draggedRef.current;
      if (!dragged || dragged.fromStatus === toStatus) {
        return;
      }

      try {
        const service = await getCrmService();
        await service.updateLead(dragged.leadId, { status: toStatus });
        refresh();
      } catch (error) {
        logger.error('Update lead status failed', error);
        NotificationsService.getInstance().error('Update lead status');
      }
    },
    [getCrmService, refresh],
  );

  const handleDragEnd = useCallback(() => {
    draggedRef.current = null;
    setDragOverStatus(null);
  }, []);

  // Table columns
  const columns: TableColumn<ICrmLead>[] = useMemo(
    () => [
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      {
        header: 'Company',
        key: 'company',
        render: (lead: ICrmLead) =>
          typeof lead.company === 'object' && lead.company
            ? lead.company.name
            : '-',
      },
      {
        header: 'Social',
        key: 'twitterHandle',
        render: (lead: ICrmLead) => (
          <SocialLinks
            twitterHandle={lead.twitterHandle}
            instagramHandle={lead.instagramHandle}
            discordHandle={lead.discordHandle}
            telegramHandle={lead.telegramHandle}
          />
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (lead: ICrmLead) => (
          <Badge
            variant={
              STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ??
              'default'
            }
          >
            {lead.status}
          </Badge>
        ),
      },
      {
        header: 'Source',
        key: 'source',
        render: (lead: ICrmLead) =>
          lead.source ? (
            <Badge
              variant={
                SOURCE_COLORS[lead.source as keyof typeof SOURCE_COLORS] ??
                'default'
              }
            >
              {lead.source}
            </Badge>
          ) : (
            '-'
          ),
      },
      {
        header: 'Contact Date',
        key: 'contactDate',
        render: (lead: ICrmLead) =>
          lead.contactDate
            ? new Date(lead.contactDate).toLocaleDateString()
            : '-',
      },
    ],
    [],
  );

  return (
    <Container
      label="Leads"
      description="Manage sales leads and track pipeline progress"
      icon={HiOutlineFunnel}
      right={
        <>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />
          <div className="flex items-center border border-white/[0.08] rounded overflow-hidden">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'pipeline'
                  ? 'bg-primary/20 text-primary'
                  : 'text-foreground/60 hover:text-foreground'
              }`}
              onClick={() => setViewMode('pipeline')}
            >
              <HiOutlineViewColumns className="w-4 h-4" />
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary/20 text-primary'
                  : 'text-foreground/60 hover:text-foreground'
              }`}
              onClick={() => setViewMode('table')}
            >
              <HiOutlineTableCells className="w-4 h-4" />
            </Button>
          </div>
          <Button
            label={
              <>
                <HiPlus /> Lead
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateModal}
          />
        </>
      }
    >
      {viewMode === 'pipeline' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {LEAD_STATUSES.map((status) => (
            <PipelineColumn
              key={status}
              status={status}
              leads={leadsByStatus[status] ?? []}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              dragOverStatus={dragOverStatus}
            />
          ))}
        </div>
      ) : (
        <AppTable<ICrmLead>
          items={leads}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(lead) => lead.id}
          onRowClick={(lead) => router.push(`/crm/leads/${lead.id}`)}
          emptyLabel="No leads found"
        />
      )}

      <LeadFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        formData={formData}
        setFormData={setFormData}
        companies={companies}
        onSubmit={handleSubmit}
        onDelete={editingLead ? handleDelete : undefined}
        isEditing={!!editingLead}
        isSaving={isSaving}
      />
    </Container>
  );
}
