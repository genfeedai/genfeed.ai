'use client';

import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import SocialLinks from '@components/social/SocialLinks';
import { ButtonVariant } from '@genfeedai/enums';
import type { ICrmCompany, ICrmLead } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import {
  AdminInputField,
  AdminSelectField,
  AdminTextareaField,
} from '@protected/crm/components/AdminFormFields';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiArrowLeft, HiOutlinePencilSquare } from 'react-icons/hi2';

const STATUS_VARIANT = {
  Churned: 'error',
  Customer: 'success',
  Lead: 'purple',
  Prospect: 'info',
} as const;

const BILLING_VARIANT = {
  Monthly: 'info',
  'Not Defined': 'ghost',
  PAYG: 'success',
} as const;

const LEAD_STATUS_COLORS = {
  contacted: 'warning',
  lost: 'error',
  negotiation: 'amber',
  new: 'info',
  proposal: 'purple',
  qualified: 'success',
  won: 'validated',
} as const;

const COMPANY_STATUSES = ['Prospect', 'Lead', 'Customer', 'Churned'];
const BILLING_TYPES = ['PAYG', 'Monthly', 'Not Defined'];

interface EditFormData {
  name: string;
  domain: string;
  status: string;
  billingType: string;
  twitterHandle: string;
  instagramHandle: string;
  avatarUrl: string;
  notes: string;
}

export default function CompanyDetail({ id }: { id: string }) {
  const _router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState<EditFormData>({
    avatarUrl: '',
    billingType: 'Not Defined',
    domain: '',
    instagramHandle: '',
    name: '',
    notes: '',
    status: 'Prospect',
    twitterHandle: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: company,
    isLoading,
    isRefreshing,
    refresh: refreshCompany,
  } = useResource<ICrmCompany>(
    async () => {
      const service = await getCrmService();
      return service.getCompany(id);
    },
    {
      dependencies: [id],
      onError: (error: Error) => {
        logger.error(`GET /admin/crm/companies/${id} failed`, error);
      },
    },
  );

  const { data: leads } = useResource<ICrmLead[]>(
    async () => {
      const service = await getCrmService();
      const allLeads = await service.getLeads();
      return allLeads.filter((l) => {
        const companyId =
          typeof l.company === 'string'
            ? l.company
            : (l.company?.id ?? l.companyRef);
        return companyId === id;
      });
    },
    {
      defaultValue: [],
      dependencies: [id],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/leads failed', error);
      },
    },
  );

  const openEditModal = useCallback(() => {
    if (!company) {
      return;
    }
    setFormData({
      avatarUrl: company.avatarUrl ?? '',
      billingType: company.billingType ?? 'Not Defined',
      domain: company.domain ?? '',
      instagramHandle: company.instagramHandle ?? '',
      name: company.name,
      notes: company.notes ?? '',
      status: company.status ?? 'Prospect',
      twitterHandle: company.twitterHandle ?? '',
    });
    setEditOpen(true);
  }, [company]);

  const handleUpdate = useCallback(async () => {
    if (!formData.name.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      const service = await getCrmService();
      await service.updateCompany(id, {
        avatarUrl: formData.avatarUrl || undefined,
        billingType: formData.billingType,
        domain: formData.domain || undefined,
        instagramHandle: formData.instagramHandle || undefined,
        name: formData.name,
        notes: formData.notes || undefined,
        status: formData.status,
        twitterHandle: formData.twitterHandle || undefined,
      });
      NotificationsService.getInstance().success('Company updated');
      setEditOpen(false);
      refreshCompany();
    } catch (error) {
      logger.error('Update company failed', error);
      NotificationsService.getInstance().error('Update company');
    } finally {
      setIsSaving(false);
    }
  }, [formData, id, getCrmService, refreshCompany]);

  const updateField = useCallback(
    (field: keyof EditFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  if (isLoading || !company) {
    return (
      <Container label="Company Detail">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/3" />
          <div className="h-48 bg-white/5 rounded" />
        </div>
      </Container>
    );
  }

  const billing = company.billingType ?? 'Not Defined';

  return (
    <Container
      label={company.name}
      description="Company details and linked leads"
      right={
        <ButtonRefresh
          onClick={() => refreshCompany()}
          isRefreshing={isRefreshing}
        />
      }
    >
      <div className="mb-4">
        <PrimitiveButton asChild variant={ButtonVariant.SECONDARY}>
          <Link href="/crm/companies">
            <HiArrowLeft className="w-4 h-4" /> Back to Companies
          </Link>
        </PrimitiveButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - 2 cols */}
        <div className="lg:col-span-2">
          <WorkspaceSurface
            title="Company Profile"
            tone="muted"
            data-testid="crm-company-profile-surface"
          >
            <div className="flex items-start gap-4">
              {company.avatarUrl ? (
                <Image
                  src={company.avatarUrl}
                  alt={company.name}
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                  width={64}
                  height={64}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                  {company.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-semibold">{company.name}</h2>
                  {company.status && (
                    <Badge
                      variant={
                        STATUS_VARIANT[
                          company.status as keyof typeof STATUS_VARIANT
                        ] ?? 'default'
                      }
                    >
                      {company.status}
                    </Badge>
                  )}
                  <Badge
                    variant={
                      BILLING_VARIANT[
                        billing as keyof typeof BILLING_VARIANT
                      ] ?? 'ghost'
                    }
                  >
                    {billing}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm text-foreground/60">
                  {company.domain && (
                    <div>
                      <span className="text-foreground/40">Domain:</span>{' '}
                      <a
                        href={
                          company.domain.startsWith('http')
                            ? company.domain
                            : `https://${company.domain}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {company.domain}
                      </a>
                    </div>
                  )}
                  <div>
                    <span className="text-foreground/40">Created:</span>{' '}
                    {new Date(company.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <SocialLinks
                  twitterHandle={company.twitterHandle}
                  instagramHandle={company.instagramHandle}
                  className="mt-3"
                />
                {company.notes && (
                  <p className="mt-3 text-sm text-foreground/50 whitespace-pre-wrap">
                    {company.notes}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/[0.08]">
              <Button
                label={
                  <>
                    <HiOutlinePencilSquare className="w-4 h-4" /> Edit
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={openEditModal}
              />
            </div>
          </WorkspaceSurface>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <WorkspaceSurface
            title="Linked Leads"
            tone="muted"
            data-testid="crm-company-linked-leads-surface"
          >
            {leads.length === 0 ? (
              <p className="text-sm text-foreground/40 text-center py-4">
                No leads linked to this company
              </p>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <PrimitiveButton
                    key={lead.id}
                    asChild
                    variant={ButtonVariant.UNSTYLED}
                    className="w-full text-left p-3 bg-white/[0.03] border border-white/[0.08] rounded hover:border-white/[0.15] transition-colors"
                  >
                    <Link href={`/crm/leads/${lead.id}`}>
                      <div>
                        <div className="font-medium text-sm">{lead.name}</div>
                        {lead.email && (
                          <div className="text-xs text-foreground/50 mt-0.5">
                            {lead.email}
                          </div>
                        )}
                        <Badge
                          variant={
                            LEAD_STATUS_COLORS[
                              lead.status as keyof typeof LEAD_STATUS_COLORS
                            ] ?? 'default'
                          }
                          className="mt-1"
                        >
                          {lead.status}
                        </Badge>
                      </div>
                    </Link>
                  </PrimitiveButton>
                ))}
              </div>
            )}
          </WorkspaceSurface>
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <AdminInputField
              id="company-detail-name"
              label="Name"
              required
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            <AdminInputField
              id="company-detail-domain"
              label="Domain"
              value={formData.domain}
              onChange={(e) => updateField('domain', e.target.value)}
            />
            <AdminSelectField
              id="company-detail-status"
              label="Status"
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value)}
            >
              {COMPANY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </AdminSelectField>
            <AdminSelectField
              id="company-detail-billing-type"
              label="Billing Type"
              value={formData.billingType}
              onChange={(e) => updateField('billingType', e.target.value)}
            >
              {BILLING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </AdminSelectField>
            <AdminInputField
              id="company-detail-twitter"
              label="Twitter"
              value={formData.twitterHandle}
              onChange={(e) => updateField('twitterHandle', e.target.value)}
            />
            <AdminInputField
              id="company-detail-instagram"
              label="Instagram"
              value={formData.instagramHandle}
              onChange={(e) => updateField('instagramHandle', e.target.value)}
            />
            <AdminInputField
              id="company-detail-avatar-url"
              label="Avatar URL"
              value={formData.avatarUrl}
              onChange={(e) => updateField('avatarUrl', e.target.value)}
            />
            <AdminTextareaField
              id="company-detail-notes"
              containerClassName="col-span-2"
              label="Notes"
              className="min-h-textarea"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              label={isSaving ? 'Saving...' : 'Update'}
              variant={ButtonVariant.DEFAULT}
              onClick={handleUpdate}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
