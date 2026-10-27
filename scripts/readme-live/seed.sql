-- Demo content for the README captures. Applied by capture.ts after the demo
-- account exists, against the self-hosted PostgreSQL. Everything is scoped to
-- the demo account's organization and brand, found by the account email.
-- ids are cuid-shaped because the agent snapshot endpoint rejects other shapes.
\set ON_ERROR_STOP on

CREATE TEMP TABLE demo_scope AS
SELECT u.id AS user_id, o.id AS organization_id, b.id AS brand_id
FROM users u
JOIN organizations o ON o."slug" = :'org_slug'
JOIN brands b ON b."organizationId" = o.id AND b."slug" = :'brand_slug'
WHERE u.email = :'demo_email';

INSERT INTO posts (id, "userId", "organizationId", "brandId", platform, status, label, description, category, "scheduledDate", "publishedAt", "targetExecutionState", "updatedAt", "createdAt")
SELECT v.id, s.user_id, s.organization_id, s.brand_id, v.platform, v.status, v.label, v.description, v.category::"PostCategory", v.scheduled, v.published, v.state, now(), v.created
FROM demo_scope s
CROSS JOIN (VALUES
  ('cmdemopost00000000000001', 'twitter', 'scheduled', 'Launch week recap', 'Seven days of shipping: the agent now drafts, you approve, Genfeed publishes. Here is what changed and what is next.', 'TEXT', now() + interval '1 day', NULL::timestamp, 'scheduled', now() - interval '3 hours'),
  ('cmdemopost00000000000002', 'linkedin', 'draft', 'Why we open sourced Genfeed', 'We open sourced the content engine so teams can self host it, read the code, and run it with the agent they already use.', 'TEXT', NULL::timestamp, NULL::timestamp, 'draft', now() - interval '5 hours'),
  ('cmdemopost00000000000003', 'instagram', 'scheduled', 'Weekly drop: studio still', 'Studio still for the weekly drop. Soft light, product in hand, one idea per frame.', 'IMAGE', now() + interval '2 days', NULL::timestamp, 'scheduled', now() - interval '1 day'),
  ('cmdemopost00000000000004', 'tiktok', 'draft', '15s clip: brief to feed', 'Short clip showing a brief becoming a finished post in one pass.', 'VIDEO', NULL::timestamp, NULL::timestamp, 'draft', now() - interval '2 hours'),
  ('cmdemopost00000000000005', 'twitter', 'public', 'Self host in one command', 'npx @genfeedai/create my-genfeed. Docker Compose, your keys, your data.', 'TEXT', now() - interval '1 day', now() - interval '1 day', 'published', now() - interval '2 days'),
  ('cmdemopost00000000000006', 'youtube', 'draft', 'Livestream highlights', 'Highlights from the open source launch livestream.', 'VIDEO', NULL::timestamp, NULL::timestamp, 'draft', now() - interval '30 minutes')
) AS v(id, platform, status, label, description, category, scheduled, published, state, created);

INSERT INTO agent_threads (id, "userId", "organizationId", "brandId", title, status, mode, source, "updatedAt", "createdAt")
SELECT v.id, s.user_id, s.organization_id, s.brand_id, v.title, 'active', 'manual', 'agent', v.updated, v.created
FROM demo_scope s
CROSS JOIN (VALUES
  ('cmdemothread000000000001', 'Launch week recap', now() - interval '10 minutes', now() - interval '40 minutes'),
  ('cmdemothread000000000002', 'Weekly studio still', now() - interval '1 day', now() - interval '1 day'),
  ('cmdemothread000000000003', 'Self host walkthrough clip', now() - interval '2 days', now() - interval '2 days')
) AS v(id, title, updated, created);

INSERT INTO agent_messages (id, "threadId", "organizationId", "userId", "brandId", role, content, "createdAt", "updatedAt")
SELECT v.id, 'cmdemothread000000000001', s.organization_id, CASE WHEN v.role = 'user' THEN s.user_id END, s.brand_id, v.role, v.content, v.at, v.at
FROM demo_scope s
CROSS JOIN (VALUES
  ('cmdemomessage00000000001', 'user', 'Write a launch week recap for X and LinkedIn. Keep it plain, no hype, and link the repo.', now() - interval '39 minutes'),
  ('cmdemomessage00000000002', 'assistant', E'I drafted two posts from your brand voice and saved both for review.\n\n**X (scheduled for tomorrow 09:00)**\nSeven days of shipping: the agent now drafts, you approve, Genfeed publishes. Here is what changed and what is next.\n\n**LinkedIn (draft)**\nWe open sourced the content engine so teams can self host it, read the code, and run it with the agent they already use.\n\nBoth are in Publishing > Posts. Nothing goes out until you approve it.', now() - interval '38 minutes'),
  ('cmdemomessage00000000003', 'user', 'Shorten the X post so it fits in one line and keep the repo link.', now() - interval '12 minutes'),
  ('cmdemomessage00000000004', 'assistant', E'Updated. The X post is now one line and still links github.com/genfeedai/genfeed.ai.\n\n> Seven days of shipping. Drafts by the agent, approval by you, publishing by Genfeed. github.com/genfeedai/genfeed.ai\n\nIt stays scheduled for tomorrow 09:00.', now() - interval '10 minutes')
) AS v(id, role, content, at);
