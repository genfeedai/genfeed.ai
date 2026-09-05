-- Convert stored dashboard blocks once; runtime accepts only typed text blocks.
CREATE FUNCTION pg_temp.retire_dashboard_markdown(blocks jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  block jsonb;
  converted jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(blocks) IS DISTINCT FROM 'array' THEN
    RETURN blocks;
  END IF;
  FOR block IN SELECT value FROM jsonb_array_elements(blocks) LOOP
    IF block->>'type' = 'markdown' AND jsonb_typeof(block->'content') = 'string' THEN
      block := (block - 'content') || jsonb_build_object('type', 'text_paragraph', 'text', block->'content');
    ELSIF block->>'type' = 'composite' AND jsonb_typeof(block->'blocks') = 'array' THEN
      block := jsonb_set(block, '{blocks}', pg_temp.retire_dashboard_markdown(block->'blocks'));
    END IF;
    converted := converted || jsonb_build_array(block);
  END LOOP;
  RETURN converted;
END;
$$;

UPDATE dashboard_layouts
SET document = jsonb_set(document, '{blocks}', pg_temp.retire_dashboard_markdown(document->'blocks'))
WHERE jsonb_typeof(document->'blocks') = 'array'
  AND document->'blocks' IS DISTINCT FROM pg_temp.retire_dashboard_markdown(document->'blocks');

DROP FUNCTION pg_temp.retire_dashboard_markdown(jsonb);
