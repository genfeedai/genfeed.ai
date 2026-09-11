-- #4676: Prompt enhance never enhanced a prompt and collapsed onto
-- `brandingMode`, silently suppressing branding for looks that had it off.
-- Brand voice (`brandingMode`) is now the single, truthful branding flag.
ALTER TABLE "studio_looks" DROP COLUMN "isPromptEnhanceEnabled";
