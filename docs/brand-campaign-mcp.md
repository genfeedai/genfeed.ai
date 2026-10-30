# Brand campaigns through MCP

A Publish Campaign belongs to one organization and one brand. It gives related
content a shared objective, brief, audience, voice and creative direction, plus
a collection of existing Library assets. It coordinates existing releases;
publishing, approval and provider delivery retain their current lifecycles.

## Readiness before scheduling

Default MCP connections include `get_brand_publishing_readiness` with scheduler.
Call `get_brands`, select the intended brand, and read readiness with its returned
ID. Choose a healthy, schedulable credential from that result.
`check_channel` supplies channel rules and target validation; it does not replace
credential discovery or health checks.

## Create and read a campaign

`manage_campaign` is part of the content toolset and the standard default profile.
Its actions are `list`, `get`, `create` and `update`; each requires an explicit
`input.brandId`. Reads and context changes are zero-credit operations and never
publish, generate media or start advertising spend. The dedicated restricted
connector retains its reviewed allowlist.

```json
{
  "action": "create",
  "input": {
    "brandId": "<returned brand ID>",
    "name": "Spring product launch",
    "objective": "Recruit qualified product trials",
    "brief": "Demonstrate one real customer workflow and the work needed to finish it.",
    "audience": "Small marketing teams",
    "tone": "Specific and candid",
    "creativeDirection": "Show the brief, alternatives, selection and corrections.",
    "idempotencyKey": "spring-product-launch-v1"
  }
}
```

Reuse the create key when retrying; do not invent a new key after an uncertain
response. The returned campaign ID is required for `get` and `update`.
`list` supports bounded page/limit parameters. An update accepts only editable
campaign context, dates, name and asset membership, not publishing actions.

Campaign context complements the brand context. The existing campaign content
generator includes audience, tone and creative direction in its platform-native
copy request while retaining the brand identity.

## Associate Library assets

Read the campaign before composing a media prompt. Inspect generation options
and cost before generation. Use `generate` with the campaign brief and brand ID,
wait for successful completion, inspect the result, then retain its actual
Library ID on the campaign:

```json
{
  "action": "update",
  "input": {
    "brandId": "<returned brand ID>",
    "campaignId": "<returned campaign ID>",
    "assetIds": ["<returned Library asset ID>"]
  }
}
```

`assetIds` replaces membership; pass `[]` to clear it. At most 50 unique IDs
are accepted. Assets must exist in the campaign's organization and brand and
must not be deleted, failed, rejected or archived. Campaign generation
rechecks retained membership. Asset files stay in the Library and may be used
by more than one campaign.

The Publish campaign edit page exposes the context and Library selection.
Its detail page links each retained asset back to its canonical Library view.

## Schedule existing campaign content

Validate the publishing target with `check_channel(action=validate, input=...)`.
Pass the campaign identity when creating the release:

```json
{
  "idempotencyKey": "spring-launch-x-01",
  "release": {
    "brandId": "<returned brand ID>",
    "campaignId": "<returned campaign ID>",
    "title": "Launch invitation",
    "baseContent": "<reviewed platform-native copy>",
    "timezone": "Europe/Malta",
    "scheduledDate": "<future ISO 8601 datetime with offset>",
    "status": "scheduled",
    "targets": [
      {
        "credentialId": "<healthy credential from readiness>",
        "platform": "twitter"
      }
    ]
  }
}
```

The existing API rejects missing, deleted or foreign-brand campaigns. Release
creation, target validation and publishing approval remain authoritative.
`update_scheduled_release` also accepts campaign membership on release updates.

If scheduling returns a pending approval, report it and wait for the authorized
user's decision. A pending approval is not a scheduled release. After execution,
call `get_scheduled_release` and confirm campaign identity, target, actual state
and datetime. A publishing result requires provider confirmation and a public
or private destination URL appropriate to the selected visibility.
