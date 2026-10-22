---
name: Brand campaign context and MCP
description: Native content campaign context, Library membership and external-agent scheduling contract
type: reference
last_verified: 2026-10-22
---

# Brand campaigns through MCP

Issue #7851 owns implementation and acceptance. Extend the existing Publish Campaign domain.

## Contract
- One organization and brand per campaign. Inherit brand context; retain campaign objective, brief, audience, tone and creative direction.
- Campaign asset IDs identify existing, non-deleted same-brand Library ingredients. Reject missing, foreign or unusable assets. Preserve ordering and reject duplicate input.
- Existing campaigns and unassigned releases remain valid.
- A bounded default MCP client can read publishing readiness, manage campaign records and create releases with campaignId.
- MCP campaign create/update never publishes, starts spend or bypasses release approval.
- Campaign-generated copy includes its context; Library assets can be associated through campaign create/update, then explicitly selected in release media.
- The existing Publish form/detail expose context and selected assets with shared controls.

## Interfaces
- Add audience, tone, creativeDirection and assetIds to Campaign persistence, DTOs, shared contract and serializer.
- One manage_campaign MCP tool with list/get/create/update actions, explicit brandId, exact action validation and canonical API delegation.
- Add campaignId to MCP scheduled-release create/update schemas and preserve it through canonical scheduling.

## Verification
Regression-first default catalog, campaign context/asset ownership, generation context, MCP transport/approval and release lineage; affected typechecks/builds and required current-head CI. Hosted workflow acceptance follows deployment. Separate model review not requested.
