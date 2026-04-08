'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import SocialLinks from '@components/social/SocialLinks';
import { ButtonVariant } from '@genfeedai/enums';
import type { ICrmCompany } from '@genfeedai/interfaces';
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
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { HiOutlineBuildingOffice2, HiPlus } from 'react-icons/hi2';

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

const COMPANY_STATUSES = ['Prospect', 'Lead', 'Customer', 'Churned'];
const BILLING_TYPES = ['PAYG', 'Monthly', 'Not Defined'];

interface CompanyFormData {
  name: string;
  domain: string;
  status: string;
  billingType: string;
  twitterHandle: string;
  instagramHandle: string;
  avatarUrl: string;
  notes: string;
}

const EMPTY_FORM: CompanyFormData = {
  avatarUrl: '',
  billingType: 'Not Defined',
  domain: '',
  instagramHandle: '',
  name: '',
  notes: '',
  status: 'Prospect',
  twitterHandle: '',
};

function CompanyAvatar({ company }: { company: ICrmCompany }) {
  if (company.avatarUrl) {
    return (
      <img
        src={company.avatarUrl}
        alt={company.name}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
      {company.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function CompaniesList() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: companies,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<ICrmCompany[]>(
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

  const openCreateModal = useCallback(() => {
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.name.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      const service = await getCrmService();
      await service.createCompany({
        avatarUrl: formData.avatarUrl || undefined,
        billingType: formData.billingType,
        domain: formData.domain || undefined,
        instagramHandle: formData.instagramHandle || undefined,
        name: formData.name,
        notes: formData.notes || undefined,
        status: formData.status,
        twitterHandle: formData.twitterHandle || undefined,
      });
      NotificationsService.getInstance().success('Company created');
      setModalOpen(false);
      refresh();
    } catch (error) {
      logger.error('Create company failed', error);
      NotificationsService.getInstance().error('Create company');
    } finally {
      setIsSaving(false);
    }
  }, [formData, getCrmService, refresh]);

  const updateField = useCallback(
    (field: keyof CompanyFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const columns: TableColumn<ICrmCompany>[] = useMemo(
    () => [
      {
        header: 'Company',
        key: 'name',
        render: (company: ICrmCompany) => (
          <div className="flex items-center gap-3">
            <CompanyAvatar company={company} />
            <span className="font-medium">{company.name}</span>
          </div>
        ),
      },
      {
        header: 'Domain',
        key: 'domain',
        render: (company: ICrmCompany) =>
          company.domain ? (
            <a
              href={
                company.domain.startsWith('http')
                  ? company.domain
                  : `https://${company.domain}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              {company.domain}
            </a>
          ) : (
            '-'
          ),
      },
      {
        header: 'Social',
        key: 'twitterHandle',
        render: (company: ICrmCompany) => (
          <SocialLinks
            twitterHandle={company.twitterHandle}
            instagramHandle={company.instagramHandle}
          />
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (company: ICrmCompany) =>
          company.status ? (
            <Badge
              variant={
                STATUS_VARIANT[company.status as keyof typeof STATUS_VARIANT] ??
                'default'
              }
            >
              {company.status}
            </Badge>
          ) : (
            '-'
          ),
      },
      {
        header: 'Billing',
        key: 'billingType',
        render: (company: ICrmCompany) => {
          const billing = company.billingType ?? 'Not Defined';
          return (
            <Badge
              variant={
                BILLING_VARIANT[billing as keyof typeof BILLING_VARIANT] ??
                'ghost'
              }
            >
              {billing}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  return (
    <Container
      label="Companies"
      description="Company profiles and associated leads"
      icon={HiOutlineBuildingOffice2}
      right={
        <>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />
          <Button
            label={
              <>
                <HiPlus /> Company
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateModal}
          />
        </>
      }
    >
      <AppTable<ICrmCompany>
        items={companies}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(company) => company.id}
        onRowClick={(company) => router.push(`/crm/companies/${company.id}`)}
        emptyLabel="No companies found"
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <AdminInputField
              id="company-name"
              label="Name"
              required
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Company name"
            />
            <AdminInputField
              id="company-domain"
              label="Domain"
              value={formData.domain}
              onChange={(e) => updateField('domain', e.target.value)}
              placeholder="example.com"
            />
            <AdminSelectField
              id="company-status"
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
              id="company-billing-type"
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
              id="company-twitter"
              label="Twitter"
              value={formData.twitterHandle}
              onChange={(e) => updateField('twitterHandle', e.target.value)}
              placeholder="@handle"
            />
            <AdminInputField
              id="company-instagram"
              label="Instagram"
              value={formData.instagramHandle}
              onChange={(e) => updateField('instagramHandle', e.target.value)}
              placeholder="@handle"
            />
            <AdminInputField
              id="company-avatar-url"
              label="Avatar URL"
              value={formData.avatarUrl}
              onChange={(e) => updateField('avatarUrl', e.target.value)}
              placeholder="https://..."
            />
            <AdminTextareaField
              id="company-notes"
              containerClassName="col-span-2"
              label="Notes"
              className="min-h-textarea"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Notes..."
            />
          </div>
          <DialogFooter>
            <Button
              label={isSaving ? 'Creating...' : 'Create'}
              variant={ButtonVariant.DEFAULT}
              onClick={handleSubmit}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
