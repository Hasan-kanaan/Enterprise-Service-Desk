-- Vector similarity search for the AI knowledge base. Additive only: no tables,
-- no data changes. Installed in `public`; later SQL must refer to public.vector.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;