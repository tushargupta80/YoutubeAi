CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT
  USING (id = public.current_app_user_id());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_select_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_select_own ON public.user_refresh_sessions
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_update_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_update_own ON public.user_refresh_sessions
  FOR UPDATE
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_refresh_sessions_delete_own ON public.user_refresh_sessions;
CREATE POLICY user_refresh_sessions_delete_own ON public.user_refresh_sessions
  FOR DELETE
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS note_jobs_select_own ON public.note_jobs;
CREATE POLICY note_jobs_select_own ON public.note_jobs
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS note_jobs_delete_own ON public.note_jobs;
CREATE POLICY note_jobs_delete_own ON public.note_jobs
  FOR DELETE
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS question_logs_select_own ON public.question_logs;
CREATE POLICY question_logs_select_own ON public.question_logs
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_credit_accounts_select_own ON public.user_credit_accounts;
CREATE POLICY user_credit_accounts_select_own ON public.user_credit_accounts
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS credit_ledger_select_own ON public.credit_ledger;
CREATE POLICY credit_ledger_select_own ON public.credit_ledger
  FOR SELECT
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS billing_orders_select_own ON public.billing_orders;
CREATE POLICY billing_orders_select_own ON public.billing_orders
  FOR SELECT
  USING (user_id = public.current_app_user_id());