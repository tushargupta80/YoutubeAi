DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    BEGIN
      ALTER TABLE vector_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
    END;
  END IF;
END $$;
