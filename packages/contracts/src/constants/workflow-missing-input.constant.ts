/**
 * Stable `code` on the JSON:API error a workflow execute request answers with
 * when required input values are missing. The error's `meta.missingInputs`
 * lists every missing input, so a client can ask for them and run again.
 */
export const WORKFLOW_MISSING_INPUT_CODE = 'WORKFLOW_MISSING_INPUT';
