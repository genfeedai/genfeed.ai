-- Validates the constraint 20261029120000_brand_lut added NOT VALID. Kept in
-- its own migration (its own transaction) so the scan does not extend the lock
-- taken by the DDL there. It already holds for every existing row: the new
-- "isLutEnabled" column defaults to false.
ALTER TABLE "brands" VALIDATE CONSTRAINT "brands_lut_enabled_needs_file_check";
