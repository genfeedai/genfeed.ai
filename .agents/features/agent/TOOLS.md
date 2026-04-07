# Agent Tool System

## Tool Registry Architecture

### Layer 1: Canonical Definitions (`@genfeedai/tools`)

**Directory:** `packages/tools/src/registry/`
- `source.agent.ts` -- agent surface tool definitions
- `source.mcp.ts` -- MCP surface tool definitions
- `tool-registry.ts` -- merges sources, provides lookup functions

**Key exports:**
```typescript
getToolsForSurface(surface: 'agent' | 'mcp' | 'cli'): CanonicalToolDefinition[]
getToolByName(name: string): CanonicalToolDefinition | undefined
getToolsByCategory(category: ToolCategory): CanonicalToolDefinition[]
getToolsForRole(surface, role): CanonicalToolDefinition[]
toAgentTools(tools): AgentToolDefinition[]  // adapter to agent format
```

**CanonicalToolDefinition:**
```typescript
{
  name: string
  description: string
  parameters: { type: 'object', properties: Record<string, unknown>, required?: string[] }
  creditCost: number
}
```

### Layer 2: Server Registry

**File:** `apps/server/api/src/services/agent-orchestrator/tools/agent-tool-registry.ts`

Merges:
1. `BASE_AGENT_TOOLS` = `toAgentTools(getToolsForSurface('agent'))` -- from `@genfeedai/tools`
2. `EXTRA_AGENT_TOOLS` -- additional tools (all cost 0):
   - `capture_memory`, `create_recurring_task`, `rate_content`, `rate_ingredient`, `get_top_ingredients`, `replicate_top_ingredient`
3. `AGENT_TOOLS` = union (base takes precedence on name collision)

**Exports:**
- `getToolDefinitions()` -> all `AGENT_TOOLS`
- `getToolDefinitionByName(name)` -> single tool or undefined

## Tool Executor

**File:** `apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts`

**Entry point:**
```typescript
async executeTool(
  toolName: AgentToolName,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<AgentToolResult>
```

**ToolExecutionContext:**
```typescript
{
  userId: string
  organizationId: string
  threadId?: string
  authToken?: string
  generationPriority?: string
  runId?: string        // content attribution
  strategyId?: string   // content attribution
}
```

**AgentToolResult:**
```typescript
{
  success: boolean
  data?: Record<string, unknown>
  error?: string
  creditsUsed: number
  riskLevel?: 'low' | 'medium' | 'high'
  requiresConfirmation?: boolean
  nextActions?: AgentUiAction[]
}
```

**Dispatch:** Routes tools via switch statement to handler methods. Injects 25+ service dependencies.

### Tool Categories

| Category | Examples |
|----------|----------|
| `generation` | generate_image, generate_video, generate_voice, upscale_image, reframe_image |
| `content` | create_post, schedule_post, generate_content, generate_content_batch |
| `workflow` | execute_workflow, prepare_workflow_trigger, prepare_clip_workflow_run |
| `analytics` | get_analytics, get_trends, analyze_performance, get_content_calendar |
| `campaign` | create_campaign, start_campaign |
| `social` | resolve_handle, initiate_oauth_connect, get_connection_status |
| `agent-control` | spawn_content_agent |
| `identity` | generate_as_identity |
| `ui` | render_dashboard |
| `proactive` | discover_engagements, draft_engagement_reply, get_approval_summary |
| `admin` | (GPU, training, datasets) |

## Agent Type Configurations

**File:** `apps/server/api/src/services/agent-orchestrator/constants/agent-type-config.constant.ts`

```typescript
interface AgentTypeConfig {
  defaultDailyCreditBudget: number
  defaultModel: string
  defaultTools: AgentToolName[]
  systemPromptSuffix: string
}
```

| Agent Type | Budget | Default Model | Tool Focus |
|-----------|--------|---------------|------------|
| `GENERAL` | 100 | deepseek/deepseek-chat | ALL tools |
| `X_CONTENT` | 100 | deepseek/deepseek-chat | Content + engagement + scheduling |
| `IMAGE_CREATOR` | 500 | anthropic/claude-sonnet-4-5-20250929 | Image gen + upscale + reframe + prep + workflow + voice + clips |
| `VIDEO_CREATOR` | 800 | anthropic/claude-sonnet-4-5-20250929 | Video + image + voice + clips + workflow |
| `AI_AVATAR` | 600 | anthropic/claude-sonnet-4-5-20250929 | Identity gen + video + image + voice + clips |
| `ARTICLE_WRITER` | 500 | anthropic/claude-sonnet-4-5-20250929 | Content gen + post + schedule |

**SHARED_READ_TOOLS** (18 tools, available to all agent types):
`GET_ANALYTICS`, `GET_CREDITS_BALANCE`, `GET_TRENDS`, `LIST_BRANDS`, `LIST_POSTS`, `LIST_REVIEW_QUEUE`, `GET_CONNECTION_STATUS`, `UPDATE_STRATEGY_STATE`, `GET_APPROVAL_SUMMARY`, `ANALYZE_PERFORMANCE`, `GET_CONTENT_CALENDAR`, `capture_memory`, `create_recurring_task`, `rate_content`, `rate_ingredient`, `get_top_ingredients`, `replicate_top_ingredient`

## Credit Costs

**File:** `apps/server/api/src/services/agent-orchestrator/constants/agent-credit-costs.constant.ts`

- `AGENT_CREDIT_COSTS` -- union of base (from `@genfeedai/tools`) + extra (all 0)
- `AGENT_BASE_TURN_COST` = 1
- `AGENT_MAX_TOOL_ROUNDS` = 5
- `getAgentTurnCost(model)` -- returns model-specific cost or AGENT_BASE_TURN_COST (1) default

**Per-model turn costs:**

| Model | Credits/Turn |
|-------|-------------|
| `anthropic/claude-opus-4-6` | 15 |
| `anthropic/claude-sonnet-4-5-20250929` | 10 |
| `deepseek/deepseek-chat` | 1 |
| `local/mistral-small` | 0 |
| `local/qwen-32b` | 0 |
| `openai/gpt-4o` | 8 |
| `openai/o3` | 15 |
| `openai/o4-mini` | 3 |
| `x-ai/grok-4-fast` | 1 |

## Onboarding System Prompt

**File:** `apps/server/api/src/services/agent-orchestrator/constants/onboarding-system-prompt.constant.ts`

5-step white-glove flow:
1. Brand Setup -- collect URL, `create_brand`
2. Connect Social -- `connect_social_account` to X/Instagram
3. Generate Sample Content -- `generate_onboarding_content` (3 tweets + 3 images)
4. Payment CTA -- `present_payment_options`
5. Monthly Content -- post-purchase generation, `complete_onboarding`
