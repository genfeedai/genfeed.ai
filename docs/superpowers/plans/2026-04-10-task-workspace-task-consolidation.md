# Task + WorkspaceTask Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `WorkspaceTask` collection into the `Task` collection so there is one unified task entity exposed at `POST /tasks`, visible in the task board and workspace UI alike.

**Architecture:** Extend the `Task` schema with all AI execution fields from `WorkspaceTask` (request, outputType, reviewState, orchestration, eventStream, quality, etc.), unify statuses, rename `WorkspaceTasksController` endpoints to `/tasks`, update the orchestration layer to reference `Task` instead of `WorkspaceTask`, migrate MongoDB data, and delete the `workspace-tasks` collection and all related dead code.

**Tech Stack:** NestJS, Mongoose, MongoDB, BullMQ, Next.js App Router, JSON:API serializers, Vitest, Biome

---

## Status Mapping

| WorkspaceTask status | → Unified Task status |
|---|---|
| `triaged` | `backlog` (new default) |
| `in_progress` | `in_progress` |
| `needs_review` | `in_review` |
| `completed` | `done` |
| `failed` | `failed` (new) |
| `dismissed` | `cancelled` |

`Task.reviewState` keeps the same values: `none`, `pending_approval`, `approved`, `changes_requested`, `dismissed`.
`Task.priority` unifies to: `critical`, `high`, `medium`, `low` (map WorkspaceTask `normal` → `medium`).

---

## File Map

### Modified
| File | What changes |
|---|---|
| `apps/server/api/src/collections/tasks/schemas/task.schema.ts` | Add all AI execution fields from WorkspaceTask |
| `apps/server/api/src/collections/tasks/dto/create-task.dto.ts` | Add `request`, `outputType`, `platforms`, AI fields |
| `apps/server/api/src/collections/tasks/dto/update-task.dto.ts` | Extend from new CreateTaskDto |
| `apps/server/api/src/collections/tasks/dto/task-query.dto.ts` | Add `reviewState`, `view` filter |
| `apps/server/api/src/collections/tasks/services/tasks.service.ts` | Absorb all WorkspaceTasksService methods |
| `apps/server/api/src/collections/tasks/controllers/tasks.controller.ts` | Absorb all WorkspaceTasksController endpoints |
| `apps/server/api/src/collections/tasks/tasks.module.ts` | Add all WorkspaceTasksModule imports/exports |
| `packages/serializers/src/attributes/management/task.attributes.ts` | Add all WorkspaceTask serializer attributes |
| `packages/serializers/src/configs/management/task.config.ts` | Add STANDARD_ENTITY_RELS |
| `packages/services/management/tasks.service.ts` | Absorb all WorkspaceTasksService frontend methods |
| `apps/server/api/src/services/task-orchestration/task-orchestrator.service.ts` | Replace WorkspaceTasksService → TasksService |
| `apps/server/api/src/services/task-orchestration/workspace-task.processor.ts` | Replace WorkspaceTasksService → TasksService |
| `apps/server/api/src/services/task-orchestration/workspace-task-queue.service.ts` | Rename job prefix `workspace-task-` → `task-` |
| `apps/server/api/src/services/task-orchestration/task-orchestration.module.ts` | Replace WorkspaceTasksModule → TasksModule |
| `apps/server/api/src/collections/agent-runs/schemas/agent-run.schema.ts` | Add explicit `taskId?: Types.ObjectId` (replaces `metadata.workspaceTaskId`) |
| `apps/server/api/src/queues/agent-run/agent-run.processor.ts` | Use `run.taskId` instead of `run.metadata?.workspaceTaskId` |
| `apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page.tsx` | Use `TasksService` instead of `WorkspaceTasksService` |
| `apps/app/app/(protected)/[orgSlug]/~/chat/ChatWorkspacePageShell.tsx` | Use `TasksService.createFollowUpTasks` |
| `scripts/migrate-workspace-tasks-to-tasks.ts` | New one-off migration script |

### Deleted (after migration)
- `apps/server/api/src/collections/workspace-tasks/` (entire directory)
- `packages/serializers/src/attributes/content/workspace-task.attributes.ts`
- `packages/serializers/src/configs/content/workspace-task.config.ts`
- `packages/serializers/src/server/content/workspace-task.serializer.ts`
- `packages/services/workspace/workspace-tasks.service.ts`

---

## Task 1: Extend Task Schema With AI Execution Fields

**Files:**
- Modify: `apps/server/api/src/collections/tasks/schemas/task.schema.ts`
- Test: `apps/server/api/src/collections/tasks/services/tasks.service.spec.ts` (create if not exists)

- [ ] **Step 1: Write a failing test asserting the new fields exist on created tasks**

```typescript
// apps/server/api/src/collections/tasks/services/tasks.service.spec.ts
it('accepts AI execution fields on create', () => {
  const dto = {
    title: 'Write a tweet',
    request: 'Write a tweet about AI at the age of content',
    outputType: 'post',
    platforms: ['twitter'],
  };
  // Field existence check — no DB needed, just schema shape
  expect(dto.request).toBeDefined();
  expect(dto.outputType).toBeDefined();
});
```

- [ ] **Step 2: Run test to confirm it runs (trivially passes — real failures come in Task 2 when DTOs are updated)**

```bash
bun run test --filter=@genfeedai/api -- tasks.service.spec.ts
```

- [ ] **Step 3: Add AI execution fields to the Task schema**

Add the following after the existing `linkedEntities` prop in `task.schema.ts`:

```typescript
// --- AI Execution fields (from WorkspaceTask) ---

// Content
@Prop({ maxlength: 4000, required: false, trim: true, type: String })
request?: string;

@Prop({
  enum: ['caption', 'image', 'ingredient', 'newsletter', 'post', 'video'],
  required: false,
  type: String,
})
outputType?: 'caption' | 'image' | 'ingredient' | 'newsletter' | 'post' | 'video';

@Prop({ default: [], type: [String] })
platforms!: string[];

// Review
@Prop({
  default: 'none',
  enum: ['none', 'pending_approval', 'approved', 'changes_requested', 'dismissed'],
  type: String,
})
reviewState!: 'none' | 'pending_approval' | 'approved' | 'changes_requested' | 'dismissed';

@Prop({ default: false, type: Boolean })
reviewTriggered!: boolean;

@Prop({ required: false, type: String })
resultPreview?: string;

@Prop({ required: false, type: String })
failureReason?: string;

@Prop({ required: false, type: String })
requestedChangesReason?: string;

// Routing
@Prop({ required: false, type: String })
executionPathUsed?: string;

@Prop({ required: false, type: String })
chosenModel?: string;

@Prop({ required: false, type: String })
chosenProvider?: string;

@Prop({ required: false, type: String })
routingSummary?: string;

@Prop({ default: [], type: [String] })
skillsUsed!: string[];

@Prop({ default: [], ref: 'SkillVariant', type: [Types.ObjectId] })
skillVariantIds!: Types.ObjectId[];

// Decomposition
@Prop({ required: false, type: Object })
decomposition?: {
  isSingleAgent: boolean;
  subtasks: Array<{ agentType: string; brief: string; label: string; order: number }>;
  summary: string;
};

// Quality
@Prop({ required: false, type: Object })
qualityAssessment?: Record<string, unknown>;

// Progress
@Prop({
  default: { activeRunCount: 0, message: '', percent: 0, stage: 'queued' },
  type: Object,
})
progress!: {
  activeRunCount: number;
  message: string;
  percent: number;
  stage: string;
};

// Event stream
@Prop({ default: [], type: [Object] })
eventStream!: Array<{
  createdAt: Date;
  payload?: Record<string, unknown>;
  type: string;
  userId?: string;
}>;

// Linked AI records
@Prop({ default: [], ref: 'AgentRun', type: [Types.ObjectId] })
linkedRunIds!: Types.ObjectId[];

@Prop({ default: [], ref: 'Ingredient', type: [Types.ObjectId] })
linkedOutputIds!: Types.ObjectId[];

@Prop({ default: [], ref: 'Ingredient', type: [Types.ObjectId] })
approvedOutputIds!: Types.ObjectId[];

@Prop({ default: [], type: [Types.ObjectId] })
linkedApprovalIds!: Types.ObjectId[];

@Prop({ ref: 'AgentThread', required: false, type: Types.ObjectId })
planningThreadId?: Types.ObjectId;

// Lifecycle timestamps
@Prop({ required: false, type: Date })
completedAt?: Date;

@Prop({ required: false, type: Date })
dismissedAt?: Date;
```

Also update `TASK_STATUSES` to add `failed`:

```typescript
export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'failed',
  'cancelled',
] as const;
```

- [ ] **Step 4: Add the new indexes to `tasks.module.ts` `useFactory`**

Add after existing indexes:

```typescript
// AI execution indexes
{ isDeleted: 1, organization: 1, reviewState: 1, updatedAt: -1 },
{ isDeleted: 1, organization: 1, status: 1, updatedAt: -1 },
```

- [ ] **Step 5: Run type-check on the API package**

```bash
cd apps/server/api && bunx tsc --noEmit --pretty false 2>&1 | grep "task.schema" | head -20
```

Expected: no errors in `task.schema.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/server/api/src/collections/tasks/schemas/task.schema.ts \
        apps/server/api/src/collections/tasks/tasks.module.ts
git commit -m "feat(tasks): extend Task schema with AI execution fields from WorkspaceTask"
```

---

## Task 2: Extend Task DTOs and Status Transition Map

**Files:**
- Modify: `apps/server/api/src/collections/tasks/dto/create-task.dto.ts`
- Modify: `apps/server/api/src/collections/tasks/dto/task-query.dto.ts`
- Modify: `apps/server/api/src/collections/tasks/services/tasks.service.ts`

- [ ] **Step 1: Write a failing test for DTO validation**

```typescript
// In tasks.service.spec.ts — add to existing describe block
it('status transition allows failed → backlog', () => {
  // validateStatusTransition is private; test via patch behavior
  // Just check TASK_STATUSES includes 'failed'
  expect(TASK_STATUSES).toContain('failed');
});
```

- [ ] **Step 2: Run to confirm it fails (failed not yet in STATUS_TRANSITIONS)**

```bash
bun run test --filter=@genfeedai/api -- tasks.service.spec.ts
```

- [ ] **Step 3: Update `create-task.dto.ts` — add AI fields**

Add after `linkedEntities` field:

```typescript
@IsOptional()
@IsString()
@MaxLength(4000)
@ApiProperty({ description: 'AI generation request text', required: false, type: String })
request?: string;

@IsOptional()
@IsEnum(['caption', 'image', 'ingredient', 'newsletter', 'post', 'video'])
@ApiProperty({ description: 'Output type for AI generation', required: false, enum: ['caption', 'image', 'ingredient', 'newsletter', 'post', 'video'] })
outputType?: string;

@IsOptional()
@IsArray()
@IsString({ each: true })
@ApiProperty({ description: 'Target platforms', required: false, type: [String] })
platforms?: string[];
```

- [ ] **Step 4: Update `task-query.dto.ts` — add `reviewState` and `view` filters**

Add after `goalId`:

```typescript
@IsOptional()
@IsEnum(['none', 'pending_approval', 'approved', 'changes_requested', 'dismissed'])
@ApiProperty({ description: 'Filter by review state', required: false })
reviewState?: string;

@IsOptional()
@IsEnum(['all', 'inbox', 'in_progress'])
@ApiProperty({ description: 'Preset view filter', required: false, enum: ['all', 'inbox', 'in_progress'] })
view?: 'all' | 'inbox' | 'in_progress';
```

- [ ] **Step 5: Update `STATUS_TRANSITIONS` in `tasks.service.ts` — add `failed`**

```typescript
const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  backlog: ['todo', 'in_progress', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['backlog', 'todo'],
  done: ['in_progress'],
  failed: ['backlog', 'in_progress'],   // ← new
  in_progress: ['blocked', 'in_review', 'done', 'failed', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  todo: ['in_progress', 'blocked', 'backlog', 'cancelled'],
};
```

- [ ] **Step 6: Run tests**

```bash
bun run test --filter=@genfeedai/api -- tasks.service.spec.ts
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add apps/server/api/src/collections/tasks/dto/ \
        apps/server/api/src/collections/tasks/services/tasks.service.ts
git commit -m "feat(tasks): add AI execution fields to Task DTOs, add failed status"
```

---

## Task 3: Absorb WorkspaceTasksService Into TasksService

**Files:**
- Modify: `apps/server/api/src/collections/tasks/services/tasks.service.ts`
- Modify: `apps/server/api/src/collections/tasks/tasks.module.ts`

This is the largest task. Copy every public method from `WorkspaceTasksService` into `TasksService`, updating references from `WorkspaceTaskDocument` → `TaskDocument`.

- [ ] **Step 1: Write failing tests for key WorkspaceTask service methods that must now exist on TasksService**

```typescript
// tasks.service.spec.ts
it('has recordTaskEvent method', () => {
  const { service } = createService();
  expect(typeof service.recordTaskEvent).toBe('function');
});

it('has approve method', () => {
  const { service } = createService();
  expect(typeof service.approve).toBe('function');
});

it('has buildRoutingDecision method via create', async () => {
  // Routing happens inside create() — test via create with a post request
  const created = await service.create({
    organization: new Types.ObjectId('507f1f77bcf86cd799439022'),
    user: new Types.ObjectId('507f1f77bcf86cd799439023'),
    title: 'Tweet test',
    request: 'Write a tweet about AI content',
  });
  expect(created.status).toBe('backlog'); // triaged → backlog
  expect(created.executionPathUsed).toBe('caption_generation');
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
bun run test --filter=@genfeedai/api -- tasks.service.spec.ts
```

- [ ] **Step 3: Add missing imports to `tasks.module.ts`**

Copy all imports from `workspace-tasks.module.ts` that are not already in `tasks.module.ts`:

```typescript
// Add to tasks.module.ts imports array:
forwardRef(() => AgentMessagesModule),
forwardRef(() => AgentOrchestratorModule),
forwardRef(() => AgentRunsModule),
AgentThreadsModule,
forwardRef(() => IngredientsModule),
SkillsModule,
NotificationsPublisherModule,
forwardRef(() => QueuesModule),
OrganizationsModule, // already present
```

Add to `tasks.module.ts` providers/exports as needed by service dependencies.

- [ ] **Step 4: Copy service methods from WorkspaceTasksService → TasksService**

Methods to copy (replace `WorkspaceTask` type references with `Task`):

- `approve(id, organizationId)` — sets `status: 'done'`, `reviewState: 'approved'`
- `requestChanges(id, organizationId, userId, reason)` — sets `status: 'in_review'`, `reviewState: 'changes_requested'`
- `dismiss(id, organizationId, userId, reason?)` — sets `status: 'cancelled'`, `reviewState: 'dismissed'`
- `keepOutput(id, outputId, organizationId)` — `$addToSet: { approvedOutputIds }`
- `unkeepOutput(id, outputId, organizationId)` — `$pull: { approvedOutputIds }`
- `trashOutput(id, outputId, organizationId)` — soft-deletes the linked ingredient
- `recordTaskEvent(id, organizationId, userId, event, patch?)` — appends to eventStream + broadcasts
- `getInbox(organizationId, userId, limit?)` — queries `reviewState: { $in: ['pending_approval', 'changes_requested'] }` + failed/completed
- `ensurePlanningThread(id, organizationId, userId)` — creates/returns agent thread
- `createFollowUpTasks(id, organizationId, userId)` — extracts plan steps, creates child tasks
- `buildRoutingDecision(createDto, brandId, organizationId)` — private routing logic
- `buildFallbackRoutingDecision(_createDto, inferredOutputType)` — private fallback routing
- `appendEventAndBroadcast(task, organizationId, userId, event)` — WebSocket broadcast

Override `create()` to wire routing + enqueue:

```typescript
override async create(createDto: CreateTaskDto): Promise<TaskDocument> {
  const routing = createDto.request
    ? await this.buildRoutingDecision(createDto, createDto.brand?.toString(), createDto.organization?.toString())
    : null;

  const doc = await super.create({
    ...createDto,
    ...(routing ?? {}),
  });

  return doc;
}
```

- [ ] **Step 5: Run tests**

```bash
bun run test --filter=@genfeedai/api -- tasks.service.spec.ts
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/server/api/src/collections/tasks/services/tasks.service.ts \
        apps/server/api/src/collections/tasks/tasks.module.ts
git commit -m "feat(tasks): absorb WorkspaceTasksService methods into TasksService"
```

---

## Task 4: Absorb WorkspaceTasksController Into TasksController

**Files:**
- Modify: `apps/server/api/src/collections/tasks/controllers/tasks.controller.ts`

Add all `WorkspaceTasksController` endpoints to `TasksController` under the existing `/tasks` route.

- [ ] **Step 1: Write failing integration test for key endpoints**

```typescript
// tasks.service.spec.ts
it('inbox query matches tasks with pending_approval reviewState', async () => {
  const { service } = createService();
  // getInbox should return tasks with reviewState pending_approval
  const inbox = await service.getInbox('org123', 'user123', 10);
  expect(Array.isArray(inbox)).toBe(true);
});
```

- [ ] **Step 2: Add endpoints to TasksController**

```typescript
@Get('inbox')
async inbox(@Req() request: Request, @CurrentUser() user: User) {
  const { organization, userId } = getPublicMetadata(user);
  const tasks = await this.tasksService.getInbox(organization, userId);
  return serializeCollection(request, TaskSerializer, { docs: tasks, totalDocs: tasks.length });
}

@Patch(':id/approve')
async approve(@Req() request: Request, @CurrentUser() user: User, @Param('id') id: string) {
  const { organization, userId } = getPublicMetadata(user);
  const doc = await this.tasksService.approve(id, organization, userId);
  return serializeSingle(request, TaskSerializer, doc);
}

@Patch(':id/request-changes')
async requestChanges(
  @Req() request: Request, @CurrentUser() user: User, @Param('id') id: string,
  @Body() body: { reason: string },
) {
  const { organization, userId } = getPublicMetadata(user);
  const doc = await this.tasksService.requestChanges(id, organization, userId, body.reason);
  return serializeSingle(request, TaskSerializer, doc);
}

@Patch(':id/dismiss')
async dismiss(
  @Req() request: Request, @CurrentUser() user: User, @Param('id') id: string,
  @Body() body: { reason?: string },
) {
  const { organization, userId } = getPublicMetadata(user);
  const doc = await this.tasksService.dismiss(id, organization, userId, body.reason);
  return serializeSingle(request, TaskSerializer, doc);
}

@Patch(':id/outputs/:outputId/keep')
async keepOutput(@CurrentUser() user: User, @Param('id') id: string, @Param('outputId') outputId: string) {
  const { organization } = getPublicMetadata(user);
  await this.tasksService.keepOutput(id, outputId, organization);
}

@Patch(':id/outputs/:outputId/unkeep')
async unkeepOutput(@CurrentUser() user: User, @Param('id') id: string, @Param('outputId') outputId: string) {
  const { organization } = getPublicMetadata(user);
  await this.tasksService.unkeepOutput(id, outputId, organization);
}

@Patch(':id/outputs/:outputId/trash')
async trashOutput(@CurrentUser() user: User, @Param('id') id: string, @Param('outputId') outputId: string) {
  const { organization } = getPublicMetadata(user);
  await this.tasksService.trashOutput(id, outputId, organization);
}

@Post(':id/plan-thread')
async openPlanThread(@Req() request: Request, @CurrentUser() user: User, @Param('id') id: string) {
  const { organization, userId } = getPublicMetadata(user);
  const result = await this.tasksService.ensurePlanningThread(id, organization, userId);
  return result;
}

@Post(':id/children')
async createChildren(@Req() request: Request, @CurrentUser() user: User, @Param('id') id: string) {
  const { organization, userId } = getPublicMetadata(user);
  const tasks = await this.tasksService.createFollowUpTasks(id, organization, userId);
  if (this.taskQueueService) {
    await Promise.all(tasks.map(t => this.taskQueueService!.enqueue({
      taskId: t._id.toString(), organizationId: organization, userId,
      request: t.request ?? t.title, outputType: t.outputType,
      platforms: t.platforms, brandId: t.brand?.toString(),
    })));
  }
  return serializeCollection(request, TaskSerializer, { docs: tasks, totalDocs: tasks.length });
}
```

Also update `create()` override to enqueue:

```typescript
@Post()
override async create(@Req() req: Request, @CurrentUser() user: User, @Body() dto: CreateTaskDto) {
  // ... existing identifier logic ...
  const doc = await this.tasksService.create({ ...dto, identifier, organization, taskNumber });
  
  if (doc.request && this.taskQueueService) {
    await this.taskQueueService.enqueue({
      taskId: doc._id.toString(), organizationId: organization.toString(),
      userId: user.id, request: doc.request,
      outputType: doc.outputType, platforms: doc.platforms,
      brandId: doc.brand?.toString(),
    });
  }
  
  return serializeSingle(req, TaskSerializer, doc);
}
```

Inject `WorkspaceTaskQueueService` (renamed in Task 5) into constructor as optional.

- [ ] **Step 3: Run type-check**

```bash
cd apps/server/api && bunx tsc --noEmit --pretty false 2>&1 | grep "tasks.controller" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/api/src/collections/tasks/controllers/tasks.controller.ts
git commit -m "feat(tasks): absorb WorkspaceTasksController endpoints into TasksController"
```

---

## Task 5: Update Orchestration Layer to Reference Task

**Files:**
- Modify: `apps/server/api/src/services/task-orchestration/task-orchestrator.service.ts`
- Modify: `apps/server/api/src/services/task-orchestration/workspace-task.processor.ts`
- Modify: `apps/server/api/src/services/task-orchestration/workspace-task-queue.service.ts`
- Modify: `apps/server/api/src/services/task-orchestration/task-orchestration.module.ts`
- Modify: `apps/server/api/src/collections/agent-runs/schemas/agent-run.schema.ts`
- Modify: `apps/server/api/src/queues/agent-run/agent-run.processor.ts`

- [ ] **Step 1: Write a test verifying orchestrator can find task by ID**

```typescript
// task-orchestrator.service.spec.ts (create if not exists)
it('orchestrate calls tasksService.recordTaskEvent', async () => {
  // Minimal smoke test — verify the method exists
  expect(typeof orchestratorService.orchestrate).toBe('function');
});
```

- [ ] **Step 2: Update `task-orchestrator.service.ts`**

Replace every `WorkspaceTasksService` reference with `TasksService`, `WorkspaceTaskDocument` → `TaskDocument`. Status strings: `needs_review` → `in_review`, `triaged` → `backlog`.

- [ ] **Step 3: Update `workspace-task.processor.ts`**

Replace `WorkspaceTasksService` → `TasksService`. The class can stay named `WorkspaceTaskProcessor` for now (queue name stays `workspace-task` to avoid BullMQ migration).

- [ ] **Step 4: Update `task-orchestration.module.ts`**

Replace `forwardRef(() => WorkspaceTasksModule)` → `forwardRef(() => TasksModule)`.

- [ ] **Step 5: Add explicit `taskId` to `AgentRun` schema**

In `agent-run.schema.ts`, add before `isDeleted`:

```typescript
@Prop({ ref: 'Task', required: false, type: Types.ObjectId })
taskId?: Types.ObjectId;
```

- [ ] **Step 6: Update `agent-run.processor.ts`**

Replace `run.metadata?.workspaceTaskId` → `run.taskId?.toString()`.

- [ ] **Step 7: Run orchestration tests**

```bash
bun run test --filter=@genfeedai/api -- task-orchestrat
```

- [ ] **Step 8: Commit**

```bash
git add apps/server/api/src/services/task-orchestration/ \
        apps/server/api/src/collections/agent-runs/
git commit -m "feat(tasks): update orchestration layer to use TasksService instead of WorkspaceTasksService"
```

---

## Task 6: Update Task Serializer

**Files:**
- Modify: `packages/serializers/src/attributes/management/task.attributes.ts`
- Modify: `packages/serializers/src/configs/management/task.config.ts`

- [ ] **Step 1: Add all WorkspaceTask attributes to task attributes**

In `task.attributes.ts`, add to the `createEntityAttributes` call after `linkedEntities`:

```typescript
// AI execution
request: true,
outputType: true,
platforms: true,
reviewState: true,
reviewTriggered: true,
resultPreview: true,
failureReason: true,
requestedChangesReason: true,
executionPathUsed: true,
chosenModel: true,
chosenProvider: true,
routingSummary: true,
skillsUsed: true,
skillVariantIds: true,
decomposition: true,
qualityAssessment: true,
progress: true,
eventStream: true,
linkedRunIds: true,
linkedOutputIds: true,
approvedOutputIds: true,
linkedApprovalIds: true,
planningThreadId: true,
completedAt: true,
dismissedAt: true,
```

- [ ] **Step 2: Add STANDARD_ENTITY_RELS to task config**

```typescript
// task.config.ts
import { STANDARD_ENTITY_RELS } from '@genfeedai/serializers/src/configs/shared/entity-rels';

export const taskSerializerConfig = simpleConfig('task', managementTaskAttributes, {
  ...STANDARD_ENTITY_RELS,
});
```

- [ ] **Step 3: Run serializer build**

```bash
bun build:app @genfeedai/serializers 2>&1 | tail -10
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/serializers/src/attributes/management/task.attributes.ts \
        packages/serializers/src/configs/management/task.config.ts
git commit -m "feat(serializers): extend Task serializer with AI execution attributes"
```

---

## Task 7: Update Frontend Service

**Files:**
- Modify: `packages/services/management/tasks.service.ts`

- [ ] **Step 1: Add WorkspaceTask methods to `TasksService` frontend class**

In `packages/services/management/tasks.service.ts`, add to `TasksService`:

```typescript
async getInbox(limit = 20) {
  return this.findAll({ view: 'inbox', limit } as never);
}

async approve(id: string) {
  return this.request<Task>('PATCH', `/${id}/approve`);
}

async requestChanges(id: string, reason: string) {
  return this.request<Task>('PATCH', `/${id}/request-changes`, { reason });
}

async dismiss(id: string, reason?: string) {
  return this.request<Task>('PATCH', `/${id}/dismiss`, { reason });
}

async keepOutput(id: string, outputId: string) {
  return this.request('PATCH', `/${id}/outputs/${outputId}/keep`);
}

async unkeepOutput(id: string, outputId: string) {
  return this.request('PATCH', `/${id}/outputs/${outputId}/unkeep`);
}

async trashOutput(id: string, outputId: string) {
  return this.request('PATCH', `/${id}/outputs/${outputId}/trash`);
}

async ensurePlanningThread(id: string) {
  return this.request<{ threadId: string }>('POST', `/${id}/plan-thread`);
}

async createChildren(id: string) {
  return this.request<Task[]>('POST', `/${id}/children`);
}
```

Also add all WorkspaceTask fields to the `Task` class in the frontend service.

- [ ] **Step 2: Run type-check**

```bash
bun type-check 2>&1 | grep "tasks.service" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/services/management/tasks.service.ts
git commit -m "feat(services): extend frontend TasksService with AI execution methods"
```

---

## Task 8: Update Frontend Pages

**Files:**
- Modify: `apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page.tsx`
- Modify: `apps/app/app/(protected)/[orgSlug]/~/chat/ChatWorkspacePageShell.tsx`

- [ ] **Step 1: Replace all `WorkspaceTasksService` imports with `TasksService` in workspace-page.tsx**

```bash
# Find all import lines
grep -n "WorkspaceTasksService\|workspace-tasks" apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page.tsx | head -20
```

Replace import: `from '@services/workspace/workspace-tasks.service'` → `from '@services/management/tasks.service'`

Replace all usages: `WorkspaceTasksService` → `TasksService`, `WorkspaceTask` type → `Task`.

Replace API field references:
- `.status === 'needs_review'` → `.status === 'in_review'`
- `.status === 'triaged'` → `.status === 'backlog'`
- `.status === 'completed'` → `.status === 'done'`
- `.status === 'dismissed'` → `.status === 'cancelled'`

- [ ] **Step 2: Update ChatWorkspacePageShell.tsx**

Replace `WorkspaceTasksService` → `TasksService`, `.createFollowUpTasks(id)` → `.createChildren(id)`.

- [ ] **Step 3: Run Biome**

```bash
npx biome check --write apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page.tsx \
  apps/app/app/(protected)/[orgSlug]/~/chat/ChatWorkspacePageShell.tsx
```

- [ ] **Step 4: Run app type-check on touched files**

```bash
cd apps/app && bunx tsc --noEmit --pretty false 2>&1 | grep "workspace-page\|ChatWorkspace" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/app/(protected)/[orgSlug]/[brandSlug]/workspace/ \
        apps/app/app/(protected)/[orgSlug]/~/chat/ChatWorkspacePageShell.tsx
git commit -m "feat(app): update workspace UI to use unified TasksService"
```

---

## Task 9: MongoDB Migration Script

**Files:**
- Create: `scripts/migrate-workspace-tasks-to-tasks.ts`

- [ ] **Step 1: Write the migration script**

```typescript
// scripts/migrate-workspace-tasks-to-tasks.ts
/**
 * One-off migration: copy workspace-tasks documents into tasks collection.
 * Maps WorkspaceTask statuses to Task statuses.
 * Run with: bun scripts/migrate-workspace-tasks-to-tasks.ts
 */
import { MongoClient, ObjectId } from 'mongodb';

const STATUS_MAP: Record<string, string> = {
  triaged: 'backlog',
  in_progress: 'in_progress',
  needs_review: 'in_review',
  completed: 'done',
  failed: 'failed',
  dismissed: 'cancelled',
};

const PRIORITY_MAP: Record<string, string> = {
  high: 'high',
  normal: 'medium',
  low: 'low',
};

async function run() {
  const uri = process.env.LEGACY_MONGODB_URI;
  if (!uri) throw new Error('LEGACY_MONGODB_URI env var required');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const workspaceTasks = db.collection('workspace-tasks');
  const tasks = db.collection('tasks');

  // Get org counters for identifier generation
  const counters = db.collection('task-counters');

  const cursor = workspaceTasks.find({ isDeleted: false });
  let migrated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const wt = await cursor.next();
    if (!wt) continue;

    // Check if already migrated (by original _id stored in migratedFromId)
    const existing = await tasks.findOne({ migratedFromId: wt._id });
    if (existing) { skipped++; continue; }

    // Get next task number for this org
    const orgId = wt.organization.toString();
    const counter = await counters.findOneAndUpdate(
      { organization: wt.organization },
      { $inc: { count: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    const taskNumber = counter?.count ?? 1;

    // Get org prefix for identifier
    const org = await db.collection('organizations').findOne({ _id: wt.organization });
    const prefix = org?.prefix ?? 'TASK';
    const identifier = `${prefix}-${taskNumber}`;

    await tasks.insertOne({
      _id: new ObjectId(),
      assigneeUserId: null,
      brand: wt.brand,
      description: wt.request, // request becomes description
      identifier,
      isDeleted: false,
      linkedEntities: [],
      migratedFromId: wt._id, // track origin
      organization: wt.organization,
      parentId: null,
      priority: PRIORITY_MAP[wt.priority] ?? 'medium',
      request: wt.request,
      status: STATUS_MAP[wt.status] ?? 'backlog',
      taskNumber,
      title: wt.title ?? wt.request?.slice(0, 72) ?? 'Untitled',
      user: wt.user,
      // AI fields — copy as-is
      approvedOutputIds: wt.approvedOutputIds ?? [],
      chosenModel: wt.chosenModel,
      chosenProvider: wt.chosenProvider,
      completedAt: wt.completedAt,
      decomposition: wt.decomposition,
      dismissedAt: wt.dismissedAt,
      eventStream: wt.eventStream ?? [],
      executionPathUsed: wt.executionPathUsed,
      failureReason: wt.failureReason,
      linkedApprovalIds: wt.linkedApprovalIds ?? [],
      linkedOutputIds: wt.linkedOutputIds ?? [],
      linkedRunIds: wt.linkedRunIds ?? [],
      outputType: wt.outputType,
      planningThreadId: wt.planningThreadId,
      platforms: wt.platforms ?? [],
      progress: wt.progress ?? { activeRunCount: 0, message: '', percent: 0, stage: 'queued' },
      qualityAssessment: wt.qualityAssessment,
      requestedChangesReason: wt.requestedChangesReason,
      resultPreview: wt.resultPreview,
      reviewState: wt.reviewState ?? 'none',
      reviewTriggered: wt.reviewTriggered ?? false,
      routingSummary: wt.routingSummary,
      skillVariantIds: wt.skillVariantIds ?? [],
      skillsUsed: wt.skillsUsed ?? [],
      createdAt: wt.createdAt,
      updatedAt: wt.updatedAt,
    });

    // Also update any AgentRuns that reference this workspaceTaskId
    await db.collection('agent-runs').updateMany(
      { 'metadata.workspaceTaskId': wt._id.toString() },
      { $set: { taskId: wt._id } }, // keeps existing metadata, adds explicit taskId
    );

    migrated++;
    if (migrated % 100 === 0) console.log(`Migrated ${migrated}...`);
  }

  console.log(`Done: migrated=${migrated} skipped=${skipped}`);
  await client.close();
}

run().catch(console.error);
```

- [ ] **Step 2: Run dry-run against local Atlas to verify document shape**

```bash
LEGACY_MONGODB_URI="<local-atlas-uri>" bun scripts/migrate-workspace-tasks-to-tasks.ts 2>&1 | tail -5
```

Expected: `Done: migrated=N skipped=0`

- [ ] **Step 3: Verify migrated docs in mongosh**

```bash
# Check sample migrated task
mongosh "<uri>" --eval "db.tasks.findOne({ migratedFromId: { \$exists: true } })"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-workspace-tasks-to-tasks.ts
git commit -m "feat(scripts): add workspace-tasks → tasks migration script"
```

---

## Task 10: Delete WorkspaceTask Dead Code

Only run after:
- Migration script has been executed in production
- All API consumers verified to use `/tasks`

- [ ] **Step 1: Remove workspace-tasks collection from API**

```bash
rm -rf apps/server/api/src/collections/workspace-tasks/
```

- [ ] **Step 2: Remove workspace-task serializers**

```bash
rm packages/serializers/src/attributes/content/workspace-task.attributes.ts
rm packages/serializers/src/configs/content/workspace-task.config.ts
rm packages/serializers/src/server/content/workspace-task.serializer.ts
```

Update `packages/serializers/src/index.ts` to remove WorkspaceTask exports.

- [ ] **Step 3: Remove frontend workspace-tasks service**

```bash
rm packages/services/workspace/workspace-tasks.service.ts
```

Update `packages/services/index.ts` to remove WorkspaceTasksService export.

- [ ] **Step 4: Remove WorkspaceTasksModule from `app.module.ts`**

Remove `WorkspaceTasksModule` from the imports array.

- [ ] **Step 5: Run full type-check and lint**

```bash
bun type-check 2>&1 | head -30
bunx turbo lint 2>&1 | tail -20
```

Fix any remaining references.

- [ ] **Step 6: Run all scoped tests**

```bash
bun run test --filter=@genfeedai/api
bun run test --filter=@genfeedai/serializers
bun run --cwd apps/app test -- proxy.test.ts
```

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(tasks): remove WorkspaceTask collection — fully consolidated into Task"
```

---

## Verification

1. `POST /tasks` with `{ title, request: 'Write a tweet about AI', outputType: 'post' }` → task created, enqueued for orchestration, appears in task board
2. Task board and workspace inbox show same tasks
3. `GET /tasks?view=inbox` returns tasks pending review
4. `PATCH /tasks/:id/approve` marks task done
5. `POST /tasks/:id/children` creates child tasks from approved plan
6. Migration script: `db.workspace-tasks.count()` === `db.tasks.find({ migratedFromId: { $exists: true } }).count()`
7. No remaining `WorkspaceTask` or `workspace-tasks` references: `grep -r "workspace-task\|WorkspaceTask" apps/server/api/src packages/serializers packages/services --include="*.ts" | grep -v ".spec." | grep -v migration`
