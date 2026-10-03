-- Flatten release titles that were persisted as editor HTML.
--
-- `ensureReleaseForPost` used to copy the first 100 characters of the post
-- description (stored as editor HTML) straight into `post_groups.title`, so
-- operator surfaces rendered `<p>AI content is taking over!...`. New releases
-- derive a plain-text title (`deriveReleaseTitle`). This rewrites only rows
-- whose title is exactly that legacy slice of their own `baseContent` (which
-- holds the same description) and contains markup, so operator-written titles
-- such as `Latency <baseline` are never touched. Each match is flattened the
-- way new titles are: drop tags (including one cut off by the slice), decode
-- the entities the editor emits, collapse whitespace, and cap at 80
-- characters. Rows left empty become `Untitled post`.

WITH flattened AS (
  SELECT
    id,
    btrim(
      regexp_replace(
        replace(replace(replace(replace(replace(replace(
          regexp_replace(
            regexp_replace(title, '<[^>]*>', ' ', 'g'),
            '<[a-zA-Z/!][^>]*$', ' '
          ),
          '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
        '\s+', ' ', 'g'
      )
    ) AS plain_title
  FROM "post_groups"
  WHERE title ~ '<[a-zA-Z/!]'
    AND title = left("baseContent", 100)
)
UPDATE "post_groups" AS pg
SET title = CASE
  WHEN flattened.plain_title = '' THEN 'Untitled post'
  WHEN char_length(flattened.plain_title) > 80
    THEN rtrim(left(flattened.plain_title, 77)) || '...'
  ELSE flattened.plain_title
END
FROM flattened
WHERE pg.id = flattened.id;
