-- Bound message content at 10,000 characters without rewriting historical rows.
BEGIN;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_check
  CHECK (char_length(content) <= 10000) NOT VALID;

COMMIT;
