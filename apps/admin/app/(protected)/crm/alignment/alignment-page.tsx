'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
import type {
  ICrmAlignmentRule,
  ICrmAlignmentSummary,
  ICrmAlignmentValidation,
} from '@genfeedai/interfaces';
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
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useCallback, useMemo, useState } from 'react';
import {
  HiOutlineClipboardDocumentCheck,
  HiOutlineExclamationTriangle,
  HiOutlineShieldCheck,
  HiPlus,
} from 'react-icons/hi2';

interface RuleFormData {
  key: string;
  label: string;
  definition: string;
  owner: string;
  status: 'approved' | 'deprecated' | 'draft';
  notes: string;
  effectiveDate: string;
  lastReviewedAt: string;
}

const EMPTY_RULE_FORM: RuleFormData = {
  definition: '',
  effectiveDate: '',
  key: '',
  label: '',
  lastReviewedAt: '',
  notes: '',
  owner: '',
  status: 'draft',
};

function toDateInputValue(value?: string): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

function toIsoDateOrUndefined(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function statusVariant(status: ICrmAlignmentRule['status']) {
  if (status === 'approved') {
    return 'validated';
  }
  if (status === 'deprecated') {
    return 'error';
  }
  return 'warning';
}

function issueVariant(severity: 'high' | 'low' | 'medium') {
  if (severity === 'high') {
    return 'error';
  }
  if (severity === 'medium') {
    return 'warning';
  }
  return 'info';
}

export default function AlignmentPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ICrmAlignmentRule | null>(
    null,
  );
  const [formData, setFormData] = useState<RuleFormData>(EMPTY_RULE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidation, setLastValidation] =
    useState<ICrmAlignmentValidation | null>(null);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isRefreshing,
    refresh: refreshSummary,
  } = useResource<ICrmAlignmentSummary>(
    async () => {
      const service = await getCrmService();
      return service.getAlignmentSummary();
    },
    {
      onError: (error: Error) => {
        logger.error('GET /admin/crm/alignment/summary failed', error);
      },
    },
  );

  const {
    data: rules,
    isLoading: isRulesLoading,
    refresh: refreshRules,
  } = useResource<ICrmAlignmentRule[]>(
    async () => {
      const service = await getCrmService();
      return service.getAlignmentRules();
    },
    {
      defaultValue: [],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/alignment/rules failed', error);
      },
    },
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSummary(), refreshRules()]);
  }, [refreshSummary, refreshRules]);

  const openCreateModal = useCallback(() => {
    setEditingRule(null);
    setFormData(EMPTY_RULE_FORM);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((rule: ICrmAlignmentRule) => {
    setEditingRule(rule);
    setFormData({
      definition: rule.definition,
      effectiveDate: toDateInputValue(rule.effectiveDate),
      key: rule.key,
      label: rule.label,
      lastReviewedAt: toDateInputValue(rule.lastReviewedAt),
      notes: rule.notes ?? '',
      owner: rule.owner,
      status: rule.status,
    });
    setModalOpen(true);
  }, []);

  const updateField = useCallback(
    (field: keyof RuleFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSaveRule = useCallback(async () => {
    if (
      !formData.key.trim() ||
      !formData.label.trim() ||
      !formData.definition.trim()
    ) {
      NotificationsService.getInstance().error(
        'Rule key, label, and definition are required',
      );
      return;
    }

    const payload = {
      definition: formData.definition.trim(),
      effectiveDate: toIsoDateOrUndefined(formData.effectiveDate),
      key: formData.key.trim(),
      label: formData.label.trim(),
      lastReviewedAt: toIsoDateOrUndefined(formData.lastReviewedAt),
      notes: formData.notes.trim() || undefined,
      owner: formData.owner.trim() || 'unassigned',
      status: formData.status,
    };

    setIsSaving(true);
    try {
      const service = await getCrmService();
      if (editingRule) {
        await service.updateAlignmentRule(editingRule.id, payload);
        NotificationsService.getInstance().success('Alignment rule updated');
      } else {
        await service.createAlignmentRule(payload);
        NotificationsService.getInstance().success('Alignment rule created');
      }
      setModalOpen(false);
      await refreshAll();
    } catch (error) {
      logger.error('Save alignment rule failed', error);
      NotificationsService.getInstance().error('Save alignment rule');
    } finally {
      setIsSaving(false);
    }
  }, [editingRule, formData, getCrmService, refreshAll]);

  const handleRunValidation = useCallback(async () => {
    setIsValidating(true);
    try {
      const service = await getCrmService();
      const result = await service.validateAlignment();
      setLastValidation(result);
      NotificationsService.getInstance().success(
        'Alignment validation completed',
      );
      await refreshSummary();
    } catch (error) {
      logger.error('POST /admin/crm/alignment/validate failed', error);
      NotificationsService.getInstance().error('Run alignment validation');
    } finally {
      setIsValidating(false);
    }
  }, [getCrmService, refreshSummary]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.key.localeCompare(b.key)),
    [rules],
  );

  return (
    <Container
      label="Alignment"
      description="CRM data alignment, canonical rules, and validation checks"
      icon={HiOutlineShieldCheck}
      right={
        <>
          <ButtonRefresh onClick={refreshAll} isRefreshing={isRefreshing} />
          <Button
            label={isValidating ? 'Validating...' : 'Run Validation'}
            variant={ButtonVariant.SECONDARY}
            onClick={handleRunValidation}
            isDisabled={isValidating}
          />
          <Button
            label={
              <>
                <HiPlus /> Rule
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={openCreateModal}
          />
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card label="Total Leads">
          <div className="text-2xl font-semibold">
            {summary?.totalLeads ?? '-'}
          </div>
        </Card>
        <Card label="Complete Leads">
          <div className="text-2xl font-semibold text-emerald-400">
            {summary?.completeLeads ?? '-'}
          </div>
        </Card>
        <Card label="Completeness %">
          <div className="text-2xl font-semibold text-blue-400">
            {summary ? `${summary.completenessPercentage}%` : '-'}
          </div>
        </Card>
        <Card label="Stale Rules">
          <div className="text-2xl font-semibold text-amber-400">
            {summary?.staleRules ?? '-'}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkspaceSurface
          title="Open Issues"
          tone="muted"
          data-testid="crm-alignment-issues-surface"
        >
          {isSummaryLoading ? (
            <p className="text-sm text-foreground/40">
              Loading alignment summary...
            </p>
          ) : !summary || summary.openIssues.length === 0 ? (
            <p className="text-sm text-foreground/50">
              No open alignment issues
            </p>
          ) : (
            <div className="space-y-3">
              {summary.openIssues.map((issue) => (
                <div
                  key={issue.code}
                  className="rounded border border-white/[0.08] bg-white/[0.03] p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-sm">{issue.code}</span>
                    <Badge variant={issueVariant(issue.severity)}>
                      {issue.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/60">
                    {issue.description}
                  </p>
                  <p className="text-xs text-foreground/40 mt-1">
                    Metric: {issue.metric}
                  </p>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSurface>

        <WorkspaceSurface
          title="Last Validation"
          tone="muted"
          data-testid="crm-alignment-validation-surface"
        >
          {!lastValidation ? (
            <p className="text-sm text-foreground/50">
              Validation has not been run in this session.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground/60">
                Generated:{' '}
                {new Date(lastValidation.generatedAt).toLocaleString()}
              </p>
              <p className="text-sm text-foreground/60">
                Sampled lead IDs: {lastValidation.sampledLeadIds.length}
              </p>
              <div className="max-h-36 overflow-y-auto rounded border border-white/[0.08] bg-white/[0.03] p-2">
                {lastValidation.sampledLeadIds.length === 0 ? (
                  <p className="text-xs text-foreground/40">No leads sampled</p>
                ) : (
                  <div className="space-y-1">
                    {lastValidation.sampledLeadIds.map((id) => (
                      <code
                        key={id}
                        className="block text-xs text-foreground/70"
                      >
                        {id}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </WorkspaceSurface>
      </div>

      <WorkspaceSurface
        className="mt-6"
        title="Alignment Rules"
        tone="muted"
        data-testid="crm-alignment-rules-surface"
      >
        {isRulesLoading ? (
          <p className="text-sm text-foreground/40">Loading rules...</p>
        ) : sortedRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <HiOutlineClipboardDocumentCheck className="w-8 h-8 text-foreground/30 mb-2" />
            <p className="text-sm text-foreground/50">No alignment rules yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRules.map((rule) => (
              <Button
                key={rule.id}
                type="button"
                onClick={() => openEditModal(rule)}
                className="w-full text-left rounded border border-white/[0.08] bg-white/[0.03] p-3 hover:border-white/[0.16] transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium text-sm">{rule.label}</p>
                    <p className="text-xs text-foreground/40">{rule.key}</p>
                  </div>
                  <Badge variant={statusVariant(rule.status)}>
                    {rule.status}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/65 line-clamp-2">
                  {rule.definition}
                </p>
                <div className="mt-2 text-xs text-foreground/40">
                  Owner: {rule.owner}{' '}
                  {rule.lastReviewedAt
                    ? `| Reviewed: ${new Date(rule.lastReviewedAt).toLocaleDateString()}`
                    : ''}
                </div>
              </Button>
            ))}
          </div>
        )}
      </WorkspaceSurface>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Alignment Rule' : 'Create Alignment Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <AdminInputField
              id="alignment-key"
              label="Key"
              required
              value={formData.key}
              onChange={(e) => updateField('key', e.target.value)}
              placeholder="new_patient_definition"
            />
            <AdminInputField
              id="alignment-label"
              label="Label"
              required
              value={formData.label}
              onChange={(e) => updateField('label', e.target.value)}
              placeholder="New patient definition"
            />
            <AdminTextareaField
              id="alignment-definition"
              containerClassName="col-span-2"
              label="Definition"
              required
              className="min-h-24"
              value={formData.definition}
              onChange={(e) => updateField('definition', e.target.value)}
              placeholder="Canonical definition used for routing and triage"
            />
            <AdminInputField
              id="alignment-owner"
              label="Owner"
              value={formData.owner}
              onChange={(e) => updateField('owner', e.target.value)}
              placeholder="Ops Team"
            />
            <AdminSelectField
              id="alignment-status"
              label="Status"
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value)}
            >
              <option value="draft">draft</option>
              <option value="approved">approved</option>
              <option value="deprecated">deprecated</option>
            </AdminSelectField>
            <AdminInputField
              id="alignment-effective-date"
              label="Effective Date"
              type="date"
              value={formData.effectiveDate}
              onChange={(e) => updateField('effectiveDate', e.target.value)}
            />
            <AdminInputField
              id="alignment-last-reviewed"
              label="Last Reviewed"
              type="date"
              value={formData.lastReviewedAt}
              onChange={(e) => updateField('lastReviewedAt', e.target.value)}
            />
            <AdminTextareaField
              id="alignment-notes"
              containerClassName="col-span-2"
              label="Notes"
              className="min-h-20"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Context, references, or caveats"
            />
          </div>

          <DialogFooter>
            <Button
              label="Cancel"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="px-3 py-2"
              onClick={() => setModalOpen(false)}
            />
            <Button
              label={
                isSaving
                  ? 'Saving...'
                  : editingRule
                    ? 'Update Rule'
                    : 'Create Rule'
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleSaveRule}
              isDisabled={isSaving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {summary && summary.leadsMissingRequired > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <HiOutlineExclamationTriangle className="w-4 h-4" />
          {summary.leadsMissingRequired} leads still miss required fields for
          alignment readiness.
        </div>
      )}
    </Container>
  );
}
