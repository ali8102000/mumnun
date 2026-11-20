-- Add chat creation events to the existing Realtime publication.
-- Existing chats RLS policies remain the authorization boundary; no policies are changed here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;
END
$$;
