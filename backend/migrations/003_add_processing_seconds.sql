-- Example migration template.
-- Replace this file with a real schema change when needed.
-- After adding or editing a migration, restart the backend container.

ALTER TABLE note_jobs
ADD COLUMN IF NOT EXISTS processing_seconds INTEGER;