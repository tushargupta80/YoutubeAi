DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'vector_chunks'
         AND column_name = 'embedding_vector'
     ) THEN
    BEGIN
      EXECUTE '
        CREATE INDEX IF NOT EXISTS idx_vector_chunks_embedding_hnsw_cosine
        ON vector_chunks
        USING hnsw (embedding_vector vector_cosine_ops)
        WHERE embedding_vector IS NOT NULL
      ';
    EXCEPTION
      WHEN undefined_object THEN
        NULL;
      WHEN feature_not_supported THEN
        NULL;
      WHEN invalid_parameter_value THEN
        NULL;
    END;
  END IF;
END $$;
