# OSS Onboarding Access Modes TODO

- [x] Extend install-readiness response with access/runtime state
  Verify: `bun test apps/server/api/src/endpoints/onboarding/onboarding.service.spec.ts`

- [x] Add onboarding access preference types and helpers in frontend/shared interfaces
  Verify: `cd apps/app && bun test 'app/(onboarding)/onboarding/(wizard)/onboarding-access.util.test.ts'`

- [x] Persist onboarding access choice from providers/summary actions
  Verify: `cd apps/app && bun test 'app/(onboarding)/onboarding/(wizard)/providers/providers-content.test.tsx' 'app/(onboarding)/onboarding/(wizard)/summary/summary-content.test.tsx'`

- [x] Implement cloud signup handoff and post-signup auto-resume with brand/domain carryover
  Verify: `cd apps/app && bun test 'app/(onboarding)/onboarding/post-signup/post-signup-routing.util.spec.ts'`

- [x] Update organization API keys copy to match hosted-default behavior
  Verify: `cd apps/app && bun test 'app/(protected)/[orgSlug]/~/settings/(pages)/organization/api-keys/content.test.tsx'`

- [x] Run formatting and targeted checks on all touched files
  Verify: `bunx biome check <touched files> && cd apps/app && bun test <targeted files>`

- [x] Add behavior tests for the access-mode wizard actions
  Verify: `cd apps/app && bun run test -- 'app/(onboarding)/onboarding/(wizard)/providers/providers-content.behavior.test.tsx' 'app/(onboarding)/onboarding/(wizard)/summary/summary-content.behavior.test.tsx'`

- [x] Add handoff hardening tests for signup, post-signup, brand auto-resume, and success cleanup
  Verify: `cd apps/app && bun run test -- 'app/(public)/sign-up/sign-up-form.test.tsx' 'app/(onboarding)/onboarding/post-signup/page.behavior.test.tsx' 'app/(onboarding)/onboarding/(wizard)/brand/brand-content.behavior.test.tsx' 'app/(onboarding)/onboarding/(wizard)/success/success-content.behavior.test.tsx'`

- [x] Reject malformed credit handoff values and invalid access modes
  Verify: `cd apps/app && bun run test -- 'src/lib/onboarding/onboarding-access.util.test.ts' 'app/(onboarding)/onboarding/post-signup/post-signup-routing.util.spec.ts'`

- [x] Repair local `next` package link for app type-check
  Verify: `cd apps/app && bun run type-check && cd ../../packages/next-config && bun run type-check`
