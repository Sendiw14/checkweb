-- Statement timeouts belong to the database roles, not to a client startup parameter.
--
-- The application used to send `statement_timeout` as a connection startup parameter. Transaction-mode
-- poolers (PgBouncer, Supavisor) commonly reject unknown startup parameters, which would make the app unable
-- to connect through the pooler. Role-level settings are applied by PostgreSQL itself when the role's session
-- starts, so they work identically with a direct connection and with any pooler.
--
--   app_verifier  serves the public check: fail fast, the browser then shows "temporarily unavailable"
--   app_server    serves staff pages, exports and label chunks

alter role app_verifier set statement_timeout = '8s';
alter role app_server   set statement_timeout = '15s';
