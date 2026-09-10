-- Grandfather every account that already exists into a verified state.
--
-- `users.emailVerified` defaults to false and only the invitation and
-- agent-auth paths ever set it true, so every account created through normal
-- email/password signup is false today. That was harmless while
-- BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION was off.
--
-- Turning that flag on makes `emailVerified` a sign-in gate
-- (emailAndPassword.requireEmailVerification), which would block the entire
-- existing user base at their next sign-in until each one clicked a
-- verification mail. These accounts predate the rule; the rule is meant to
-- bind new signups.
--
-- Runs once, at the deploy that introduces it, so "existing" means "existed
-- when the policy changed" — exactly the set to grandfather. Accounts created
-- after this point are governed by the flag.
UPDATE "users"
SET "emailVerified" = true
WHERE "emailVerified" = false;
