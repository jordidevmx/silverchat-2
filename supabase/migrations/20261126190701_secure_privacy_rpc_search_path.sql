-- Pin invoker RPC configuration as well as the private privileged readers.
-- SQL-standard bodies already bind object references at creation time.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

ALTER FUNCTION public.read_profiles_visible(uuid[],text,text,boolean,boolean,text,integer)
  SET search_path = '';
ALTER FUNCTION public.read_channels_public(uuid[],text,integer,integer)
  SET search_path = '';
ALTER FUNCTION public.read_message_media_public(uuid[])
  SET search_path = '';
ALTER FUNCTION public.read_channel_invitations_sent(uuid)
  SET search_path = '';

NOTIFY pgrst, 'reload schema';
COMMIT;
