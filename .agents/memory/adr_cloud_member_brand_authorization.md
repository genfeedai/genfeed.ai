---
name: Cloud member brand authorization
description: Assigned-only brand access in Cloud with live canonical membership checks
type: project
last_verified: 2026-10-08
---

# Cloud member brand authorization

Vincent decided that Cloud ordinary members access only their assigned brands.
Empty assignments mean zero access immediately; existing unassigned members are
not grandfathered or backfilled. Owners and organization admins access all active
brands in their own organization. CREATOR, ANALYTICS, USER and SUPPORT remain
ordinary roles. The runtime boundary is `isCloudDeployment()`; self-hosted
assignment behavior remains unchanged.

**Why:** Empty assignments previously acted as a wildcard, allowing a member to
discover and use brands beyond their intended scope. A selected `currentBrandId`
is a preference and never an authorization grant.

**How to apply:** Use the API authorization leaf's live canonical
`Member.roleId -> Role.key` policy before reads, joins, counts, caches and provider
work. Apply the existing API-key effective-role cap before owner/admin privilege.
Pass authenticated actors through threads and queued user work; queued Knowledge
authority comes from the pinned server execution request, never historical
provenance or an organization-owner fallback. Recheck role, membership, assignment
and key authority before each asynchronous boundary. Unknown, foreign, deleted and
inaccessible brand requests use the same opaque denial. Empty Cloud access shows
“No brands assigned. Ask an organization admin for access.” while preserving
organization/account access and admin empty-organization onboarding.

Decision and full acceptance contract: [issue #5147](https://github.com/genfeedai/genfeed.ai/issues/5147).
