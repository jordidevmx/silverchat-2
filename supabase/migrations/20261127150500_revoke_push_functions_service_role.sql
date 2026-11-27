-- TASK-014 follow-up: explicitly revoke direct EXECUTE on push trigger and helper
-- functions from service_role. Postgres triggers execute automatically via
-- SECURITY DEFINER without requiring EXECUTE grants for the inserting role.

REVOKE ALL ON FUNCTION private.get_push_config() FROM service_role;
REVOKE ALL ON FUNCTION private.resolve_message_push_targets(public.messages) FROM service_role;
REVOKE ALL ON FUNCTION private.resolve_call_push_targets(public.calls) FROM service_role;
REVOKE ALL ON FUNCTION public.notify_new_message() FROM service_role;
REVOKE ALL ON FUNCTION public.notify_new_call() FROM service_role;
