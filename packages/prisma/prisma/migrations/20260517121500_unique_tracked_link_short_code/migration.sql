-- Short links are resolved globally without organization context.
-- Enforce the global uniqueness that the application already assumes.
CREATE UNIQUE INDEX "tracked_links_shortCode_key" ON "tracked_links"("shortCode");
