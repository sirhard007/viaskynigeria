-- Run after analytics.sql. Supabase includes pg_cron; this enables it for the project.
create extension if not exists pg_cron;
select cron.schedule('viasky-analytics-retention', '0 2 * * *', 'select public.viasky_cleanup();');
