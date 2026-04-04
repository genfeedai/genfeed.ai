'use client';

import type { ICrmCompany, ICrmLead, ICrmTask } from '@genfeedai/interfaces';
import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
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
import AppLink from '@ui/navigation/link/Link';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentList,
  HiOutlineTrash,
  HiPlus,
} from 'react-icons/hi2';

const PRIORITY_VARIANT = {
  high: 'warning',
  low: 'success',
  medium: 'amber',
  urgent: 'error',
} as const;

const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const ALL_STATUSES_VALUE = '__all-statuses__';
const ALL_PRIORITIES_VALUE = '__all-priorities__';

function getDueDateVariant(dueDate?: string) {
  if (!dueDate) {
    return 'ghost';
  }
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) {
    return 'error';
  }
  if (diffDays === 0) {
    return 'warning';
  }
  if (diffDays <= 7) {
    return 'info';
  }
  return 'ghost';
}

function getDueDateLabel(dueDate?: string): string {
  if (!dueDate) {
    return '';
  }
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) {
    return 'Overdue';
  }
  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays <= 7) {
    return 'This week';
  }
  return due.toLocaleDateString();
}

interface TaskFormData {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  lead: string;
  company: string;
}

const EMPTY_FORM: TaskFormData = {
  company: '',
  description: '',
  dueDate: '',
  lead: '',
  priority: 'medium',
  title: '',
};

export default function TasksPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState<TaskFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: tasks,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<ICrmTask[]>(
    async () => {
      const service = await getCrmService();
      return service.getTasks();
    },
    {
      defaultValue: [],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/tasks failed', error);
      },
    },
  );

  const { data: leads } = useResource<ICrmLead[]>(
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter && t.status !== statusFilter) {
        return false;
      }
      if (priorityFilter && t.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  const handleToggleStatus = useCallback(
    async (task: ICrmTask) => {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      try {
        const service = await getCrmService();
        await service.updateTask(task.id, { status: newStatus });
        refresh();
      } catch (error) {
        logger.error('Update task status failed', error);
        NotificationsService.getInstance().error('Update task');
      }
    },
    [getCrmService, refresh],
  );

  const handleDelete = useCallback(
    async (task: ICrmTask) => {
      try {
        const service = await getCrmService();
        await service.deleteTask(task.id);
        NotificationsService.getInstance().success('Task deleted');
        refresh();
      } catch (error) {
        logger.error('Delete task failed', error);
        NotificationsService.getInstance().error('Delete task');
      }
    },
    [getCrmService, refresh],
  );

  const handleCreate = useCallback(async () => {
    if (!formData.title.trim()) {
      return;
    }
    setIsSaving(true);
    try {
      const service = await getCrmService();
      await service.createTask({
        company: formData.company || undefined,
        description: formData.description || undefined,
        dueDate: formData.dueDate || undefined,
        lead: formData.lead || undefined,
        priority: formData.priority,
        status: 'todo',
        title: formData.title,
      });
      NotificationsService.getInstance().success('Task created');
      setModalOpen(false);
      setFormData(EMPTY_FORM);
      refresh();
    } catch (error) {
      logger.error('Create task failed', error);
      NotificationsService.getInstance().error('Create task');
    } finally {
      setIsSaving(false);
    }
  }, [formData, getCrmService, refresh]);

  const updateField = useCallback(
    (field: keyof TaskFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const getLeadName = (task: ICrmTask): string | null => {
    if (!task.lead) {
      return null;
    }
    if (typeof task.lead === 'object') {
      return task.lead.name;
    }
    const found = leads.find((l) => l.id === task.lead);
    return found?.name ?? null;
  };

  const getCompanyName = (task: ICrmTask): string | null => {
    if (!task.company) {
      return null;
    }
    if (typeof task.company === 'object') {
      return task.company.name;
    }
    const found = companies.find((c) => c.id === task.company);
    return found?.name ?? null;
  };

  return (
    <Container
      label="Tasks"
      description="CRM tasks and follow-ups"
      icon={HiOutlineClipboardDocumentList}
      right={
        <>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />
          <Button
            label={
              <>
                <HiPlus /> Task
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={() => {
              setFormData(EMPTY_FORM);
              setModalOpen(true);
            }}
          />
        </>
      }
    >
      <WorkspaceSurface
        title="Task Queue"
        tone="muted"
        data-testid="crm-tasks-surface"
        actions={
          <div className="flex gap-3">
            <Select
              value={statusFilter || ALL_STATUSES_VALUE}
              onValueChange={(value) =>
                setStatusFilter(value === ALL_STATUSES_VALUE ? '' : value)
              }
            >
              <SelectTrigger className="w-40 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES_VALUE}>All Statuses</SelectItem>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter || ALL_PRIORITIES_VALUE}
              onValueChange={(value) =>
                setPriorityFilter(value === ALL_PRIORITIES_VALUE ? '' : value)
              }
            >
              <SelectTrigger className="w-40 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PRIORITIES_VALUE}>
                  All Priorities
                </SelectItem>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <p className="py-8 text-center text-foreground/40">No tasks found</p>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const leadName = getLeadName(task);
              const companyName = getCompanyName(task);
              const leadId =
                typeof task.lead === 'string' ? task.lead : task.lead?.id;

              return (
                <Card key={task.id}>
                  <div className="flex items-center gap-3">
                    <Button
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      onClick={() => handleToggleStatus(task)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        task.status === 'done'
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                          : 'border-white/[0.15] hover:border-white/[0.3]'
                      }`}
                    >
                      {task.status === 'done' && (
                        <HiOutlineCheckCircle className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            task.status === 'done'
                              ? 'text-foreground/40 line-through'
                              : ''
                          }`}
                        >
                          {task.title}
                        </span>
                        <Badge
                          variant={
                            PRIORITY_VARIANT[
                              task.priority as keyof typeof PRIORITY_VARIANT
                            ] ?? 'default'
                          }
                        >
                          {task.priority}
                        </Badge>
                        {task.dueDate && (
                          <Badge variant={getDueDateVariant(task.dueDate)}>
                            {getDueDateLabel(task.dueDate)}
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="mt-0.5 truncate text-xs text-foreground/50">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3">
                        {leadName && leadId ? (
                          <AppLink
                            url={`/crm/leads/${leadId}`}
                            label={leadName}
                            variant={ButtonVariant.UNSTYLED}
                            className="p-0 text-xs text-primary hover:underline"
                          />
                        ) : null}
                        {companyName && (
                          <span className="text-xs text-foreground/40">
                            {companyName}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      onClick={() => handleDelete(task)}
                      className="shrink-0 text-foreground/30 transition-colors hover:text-rose-400"
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </WorkspaceSurface>

      {/* Create Task Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <AdminInputField
              id="task-title"
              containerClassName="col-span-2"
              label="Title"
              required
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Task title"
            />
            <AdminTextareaField
              id="task-description"
              containerClassName="col-span-2"
              label="Description"
              className="min-h-textarea"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Task description..."
            />
            <AdminSelectField
              id="task-priority"
              label="Priority"
              value={formData.priority}
              onChange={(e) => updateField('priority', e.target.value)}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </AdminSelectField>
            <AdminInputField
              id="task-due-date"
              label="Due Date"
              type="date"
              value={formData.dueDate}
              onChange={(e) => updateField('dueDate', e.target.value)}
            />
            <AdminSelectField
              id="task-lead"
              label="Lead"
              value={formData.lead}
              onChange={(e) => updateField('lead', e.target.value)}
            >
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </AdminSelectField>
            <AdminSelectField
              id="task-company"
              label="Company"
              value={formData.company}
              onChange={(e) => updateField('company', e.target.value)}
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </AdminSelectField>
          </div>
          <DialogFooter>
            <Button
              label={isSaving ? 'Creating...' : 'Create'}
              variant={ButtonVariant.DEFAULT}
              onClick={handleCreate}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
