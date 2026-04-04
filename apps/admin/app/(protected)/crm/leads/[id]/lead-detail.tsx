'use client';

import type {
  ICrmCompany,
  ICrmLead,
  ICrmLeadActivity,
  ICrmTask,
} from '@genfeedai/interfaces';
import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import SocialLinks from '@components/social/SocialLinks';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import ProactiveOnboardingCard from '@protected/crm/leads/[id]/proactive-onboarding-card';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  HiArrowLeft,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlinePencilSquare,
  HiOutlinePhone,
  HiOutlineTrash,
  HiPlus,
} from 'react-icons/hi2';

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
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

const ACTIVITY_ICONS: Record<string, typeof HiOutlineEnvelope> = {
  call: HiOutlinePhone,
  email: HiOutlineEnvelope,
  meeting: HiOutlineChatBubbleLeftRight,
  note: HiOutlinePencilSquare,
  status_change: HiOutlineCheckCircle,
  task_completed: HiOutlineCheckCircle,
};

const ACTIVITY_TYPES = ['note', 'email', 'call', 'meeting'] as const;

export default function LeadDetail({ id }: { id: string }) {
  const router = useRouter();
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<string>('note');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: lead,
    isLoading,
    isRefreshing,
    refresh: refreshLead,
  } = useResource<ICrmLead>(
    async () => {
      const service = await getCrmService();
      return service.getLead(id);
    },
    {
      dependencies: [id],
      onError: (error: Error) => {
        logger.error(`GET /admin/crm/leads/${id} failed`, error);
      },
    },
  );

  const { data: activities, refresh: refreshActivities } = useResource<
    ICrmLeadActivity[]
  >(
    async () => {
      const service = await getCrmService();
      return service.getLeadActivities(id);
    },
    {
      defaultValue: [],
      dependencies: [id],
      onError: (error: Error) => {
        logger.error(`GET /admin/crm/leads/${id}/activities failed`, error);
      },
    },
  );

  const { data: tasks, refresh: refreshTasks } = useResource<ICrmTask[]>(
    async () => {
      const service = await getCrmService();
      const allTasks = await service.getTasks();
      return allTasks.filter(
        (t) => (typeof t.lead === 'string' ? t.lead : t.lead?.id) === id,
      );
    },
    {
      defaultValue: [],
      dependencies: [id],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/tasks failed', error);
      },
    },
  );

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!lead || lead.status === newStatus) {
        return;
      }
      try {
        const service = await getCrmService();
        await service.updateLead(id, { status: newStatus });
        NotificationsService.getInstance().success('Status updated');
        refreshLead();
      } catch (error) {
        logger.error('Update lead status failed', error);
        NotificationsService.getInstance().error('Update status');
      }
    },
    [lead, id, getCrmService, refreshLead],
  );

  const handleDelete = useCallback(async () => {
    try {
      const service = await getCrmService();
      await service.deleteLead(id);
      NotificationsService.getInstance().success('Lead deleted');
      router.push('/crm/leads');
    } catch (error) {
      logger.error('Delete lead failed', error);
      NotificationsService.getInstance().error('Delete lead');
    }
  }, [id, getCrmService, router]);

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) {
      return;
    }
    setIsSubmittingNote(true);
    try {
      const service = await getCrmService();
      await service.createLeadActivity(id, {
        description: newNote.trim(),
        type: noteType,
      });
      setNewNote('');
      NotificationsService.getInstance().success('Activity added');
      refreshActivities();
    } catch (error) {
      logger.error('Create activity failed', error);
      NotificationsService.getInstance().error('Add activity');
    } finally {
      setIsSubmittingNote(false);
    }
  }, [newNote, noteType, id, getCrmService, refreshActivities]);

  const handleToggleTask = useCallback(
    async (task: ICrmTask) => {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      try {
        const service = await getCrmService();
        await service.updateTask(task.id, { status: newStatus });
        refreshTasks();
      } catch (error) {
        logger.error('Update task failed', error);
      }
    },
    [getCrmService, refreshTasks],
  );

  const handleQuickAddTask = useCallback(async () => {
    if (!quickTaskTitle.trim()) {
      return;
    }
    try {
      const service = await getCrmService();
      await service.createTask({
        lead: id,
        priority: 'medium',
        status: 'todo',
        title: quickTaskTitle.trim(),
      });
      setQuickTaskTitle('');
      NotificationsService.getInstance().success('Task added');
      refreshTasks();
    } catch (error) {
      logger.error('Create task failed', error);
      NotificationsService.getInstance().error('Add task');
    }
  }, [quickTaskTitle, id, getCrmService, refreshTasks]);

  if (isLoading || !lead) {
    return (
      <Container label="Lead Detail">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/3" />
          <div className="h-48 bg-white/5 rounded" />
        </div>
      </Container>
    );
  }

  const companyName =
    typeof lead.company === 'object' && lead.company
      ? (lead.company as ICrmCompany).name
      : null;

  return (
    <Container
      label={lead.name}
      description="Lead details, notes, and activity history"
      right={
        <ButtonRefresh
          onClick={() => refreshLead()}
          isRefreshing={isRefreshing}
        />
      }
    >
      <div className="mb-4">
        <AppLink
          url="/crm/leads"
          label={
            <>
              <HiArrowLeft className="w-4 h-4" /> Back to Leads
            </>
          }
          variant={ButtonVariant.SECONDARY}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          <WorkspaceSurface
            eyebrow="Lead Profile"
            title={lead.name}
            tone="muted"
            data-testid="crm-lead-profile"
            actions={
              <div className="flex gap-2">
                <Button
                  label={
                    <>
                      <HiOutlinePencilSquare className="w-4 h-4" /> Edit
                    </>
                  }
                  variant={ButtonVariant.DEFAULT}
                  onClick={() => router.push(`/crm/leads`)}
                />
                <Button
                  label={
                    <>
                      <HiOutlineTrash className="w-4 h-4" /> Delete
                    </>
                  }
                  variant={ButtonVariant.DESTRUCTIVE}
                  onClick={handleDelete}
                />
              </div>
            }
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold text-primary shrink-0">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <Badge
                    variant={
                      STATUS_COLORS[
                        lead.status as keyof typeof STATUS_COLORS
                      ] ?? 'default'
                    }
                  >
                    {lead.status}
                  </Badge>
                </div>
                {lead.dealValue != null && (
                  <div className="text-lg font-medium text-emerald-400 mb-2">
                    {(lead.dealValue / 100).toLocaleString('en-US', {
                      currency: lead.currency ?? 'USD',
                      style: 'currency',
                    })}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm text-foreground/60">
                  {lead.email && (
                    <div>
                      <span className="text-foreground/40">Email:</span>{' '}
                      {lead.email}
                    </div>
                  )}
                  {companyName && (
                    <div>
                      <span className="text-foreground/40">Company:</span>{' '}
                      {companyName}
                    </div>
                  )}
                  {lead.contactDate && (
                    <div>
                      <span className="text-foreground/40">Contact:</span>{' '}
                      {new Date(lead.contactDate).toLocaleDateString()}
                    </div>
                  )}
                  {lead.source && (
                    <div>
                      <span className="text-foreground/40">Source:</span>{' '}
                      {lead.source}
                    </div>
                  )}
                </div>
                <SocialLinks
                  twitterHandle={lead.twitterHandle}
                  instagramHandle={lead.instagramHandle}
                  discordHandle={lead.discordHandle}
                  telegramHandle={lead.telegramHandle}
                  className="mt-3"
                />
                {lead.notes && (
                  <div className="mt-4 rounded border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/35">
                      Notes
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/55">
                      {lead.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </WorkspaceSurface>

          {/* Activity Timeline */}
          <WorkspaceSurface
            eyebrow="Relationship Feed"
            title="Activity Timeline"
            tone="muted"
            data-testid="crm-lead-activity"
          >
            <div className="mb-4 flex gap-2 rounded border border-white/[0.08] bg-white/[0.02] p-3">
              <Select value={noteType} onValueChange={setNoteType}>
                <SelectTrigger className="w-36 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                className="flex-1 bg-white/5 border border-white/[0.08] rounded px-3 py-2 text-sm"
                placeholder="Add a note or activity..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddNote();
                  }
                }}
              />
              <Button
                label={isSubmittingNote ? '...' : 'Add'}
                variant={ButtonVariant.DEFAULT}
                onClick={handleAddNote}
              />
            </div>

            <div className="space-y-0">
              {activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-foreground/40">
                  No activities yet
                </p>
              ) : (
                activities.map((activity) => {
                  const Icon =
                    ACTIVITY_ICONS[activity.type] ?? HiOutlinePencilSquare;
                  return (
                    <div
                      key={activity.id}
                      className="flex gap-3 border-b border-white/[0.05] py-4 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-foreground/50" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="ghost">{activity.type}</Badge>
                          <span className="text-xs text-foreground/40">
                            {new Date(activity.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/70">
                          {activity.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </WorkspaceSurface>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <WorkspaceSurface
            eyebrow="Pipeline"
            title="Status"
            tone="muted"
            density="compact"
            data-testid="crm-lead-status"
          >
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((status) => (
                <Button
                  key={status}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors capitalize ${
                    lead.status === status
                      ? 'bg-primary/20 border-primary/40 text-primary'
                      : 'bg-white/[0.03] border-white/[0.08] text-foreground/60 hover:border-white/[0.15]'
                  }`}
                  onClick={() => handleStatusChange(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </WorkspaceSurface>

          {/* Proactive Onboarding */}
          <ProactiveOnboardingCard lead={lead} onRefresh={refreshLead} />

          {/* Tasks Card */}
          <WorkspaceSurface
            eyebrow="Execution"
            title="Tasks"
            tone="muted"
            density="compact"
            data-testid="crm-lead-tasks"
          >
            <div className="space-y-2 mb-3">
              {tasks.length === 0 ? (
                <p className="text-sm text-foreground/40 text-center py-2">
                  No tasks
                </p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1">
                    <Button
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      onClick={() => handleToggleTask(task)}
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                        task.status === 'done'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'border-white/[0.15] hover:border-white/[0.3]'
                      }`}
                    >
                      {task.status === 'done' && (
                        <HiOutlineCheckCircle className="w-3 h-3" />
                      )}
                    </Button>
                    <span
                      className={`text-sm truncate ${
                        task.status === 'done'
                          ? 'line-through text-foreground/40'
                          : 'text-foreground/70'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                className="flex-1 bg-white/5 border border-white/[0.08] rounded px-3 py-1.5 text-sm"
                placeholder="Quick add task..."
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickAddTask();
                  }
                }}
              />
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                className="px-2 py-1.5 bg-white/5 border border-white/[0.08] rounded hover:bg-white/10 transition-colors"
                onClick={handleQuickAddTask}
              >
                <HiPlus className="w-4 h-4" />
              </Button>
            </div>
          </WorkspaceSurface>
        </div>
      </div>
    </Container>
  );
}
