# Sentry → GitHub Auto-PR Setup Guide

## How It Works

```
Sentry detects error
  → Sentry Webhook fires (on first event of new issue)
    → Hits GitHub API (repository_dispatch)
      → GitHub Action triggers
        → Creates branch fix/sentry/[culprit]-[timestamp]
          → Creates .sentry-fixes/[event_id].md with full context
            → Opens PR against develop with stacktrace + tags
```

## Setup Steps

### 1. Create a GitHub Personal Access Token (PAT)

Go to: https://github.com/settings/tokens/new

- **Scopes**: `repo` (full control)
- **Name**: `sentry-webhook-genfeed`
- Save the token.

### 2. Configure Sentry Internal Integration

1. Go to **Sentry** → **Settings** → **Developer Settings** → **Custom Integrations**
2. Click **Create New Integration** → **Internal Integration**
3. Configure:
   - **Name**: `GitHub Auto-PR`
   - **Webhook URL**: `https://api.github.com/repos/genfeedai/cloud/dispatches`
   - **Permissions**: No Sentry permissions needed (it's outbound only)
4. Under **Webhooks**, enable:
   - ✅ `issue` (triggers on new issues)

### 3. Create Sentry Webhook (Alternative: use Sentry's webhook alerts)

1. Go to **Sentry** → **Alerts** → **Create Alert**
2. Choose **Issue Alert** → **When**: "A new issue is created"
3. **Action**: Send a webhook notification
4. **URL**:
   ```
   https://api.github.com/repos/genfeedai/cloud/dispatches
   ```
5. **Headers**:
   ```
   Authorization: token YOUR_GITHUB_PAT
   Accept: application/vnd.github.v3+json
   Content-Type: application/json
   ```
6. **Body** (JSON):
   ```json
   {
     "event_type": "sentry-issue",
     "client_payload": {
       "title": "{{title}}",
       "culprit": "{{culprit}}",
       "url": "{{url}}",
       "level": "{{level}}",
       "first_seen": "{{first_seen}}",
       "event_id": "{{event_id}}",
       "project": "{{project_name}}",
       "stacktrace": "{{stacktrace}}",
       "tags": "{{tags}}"
     }
   }
   ```

### 4. Alternative: Use a Relay Script

If Sentry's built-in webhooks don't support custom body transforms, deploy this simple relay:

```javascript
// scripts/sentry-webhook-relay.js
// Deploy as a serverless function or add to your API
import express from 'express';
const app = express();
app.use(express.json());

app.post('/sentry-webhook', async (req, res) => {
  const { event, ...data } = req.body;

  // Only trigger on new issues (not updates)
  if (data.action !== 'created') return res.sendStatus(200);

  const issue = data.data?.issue || {};

  await fetch('https://api.github.com/repos/genfeedai/cloud/dispatches', {
    method: 'POST',
    headers: {
      'Authorization': `token ${process.env.GITHUB_PAT}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'sentry-issue',
      client_payload: {
        title: issue.title || 'Unknown Error',
        culprit: issue.culprit || 'unknown',
        url: issue.permalink || '',
        level: issue.level || 'error',
        first_seen: issue.firstSeen || '',
        event_id: issue.shortId || 'unknown',
        project: issue.project?.name || 'genfeed',
        stacktrace: issue.metadata?.value || 'No stacktrace',
        tags: JSON.stringify(issue.tags || {}),
      },
    }),
  });

  res.sendStatus(200);
});

app.listen(3099, () => console.log('Sentry relay on :3099'));
```

Then point Sentry webhook to: `https://your-server.com/sentry-webhook`

### 5. Test It

```bash
# Simulate a Sentry webhook to test the GitHub Action
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/genfeedai/cloud/dispatches \
  -d '{
    "event_type": "sentry-issue",
    "client_payload": {
      "title": "TypeError: Cannot read property of undefined",
      "culprit": "api/src/services/workflow.service.ts",
      "url": "https://sentry.io/issues/test-123",
      "level": "error",
      "first_seen": "2026-02-11T17:00:00Z",
      "event_id": "test-001",
      "project": "genfeed-cloud",
      "stacktrace": "TypeError: Cannot read property '\''execute'\'' of undefined\n  at WorkflowService.run (workflow.service.ts:42)\n  at ApiController.trigger (api.controller.ts:18)",
      "tags": "{\"environment\": \"production\", \"browser\": \"Chrome\"}"
    }
  }'
```

## Files Created

- `.github/workflows/sentry-auto-pr.yml` — GitHub Action that creates branch + PR
- `.sentry-fixes/` — Directory where error context files are committed (gitignored in production, committed in fix branches)
