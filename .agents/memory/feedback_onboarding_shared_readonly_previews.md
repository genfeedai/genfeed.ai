---
name: Onboarding uses the app UI and read-only content review
description: Approved onboarding presentation and recovery rules from the October 22 prototype.
type: feedback
last_verified: 2026-10-22
---

Onboarding reuses the existing application frame, sidebar, buttons, social preview layouts and brand icons. The left sidebar shows non-clickable step progress. Back, Continue and confirmed Skip onboarding belong in the sub-topbar.

Generated pieces are read-only during onboarding. Keep, reject with a dimmed preview, and Undo are sufficient; editing happens afterward in the workspace. Use two wider preview columns rather than compressing all four platforms into one row. Account connections use shared cards and platform logos.

Brand entry is a single-line website or public-profile input with an inline submit and one short explanation. Remove repeated titles, save/restore notices and explanatory copy that does not help a decision.

**Why:** Vincent selected the existing app UI and asked to reduce onboarding to reviewing useful generated content, with no premature editing or publishing.

**How to apply:** Restore the organization/brand-owned run and its results before dispatching generation. Refresh and Back must never create another credit-bearing request. Preserve successful assets and observe in-flight jobs. Do not use browser-only persistence as the duplicate-charge guard. Keep the approved prototype outside master; implementation and verification are tracked in #7775 / #7834.

