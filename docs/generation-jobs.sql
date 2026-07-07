create extension if not exists pgcrypto;

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  client_key_hash text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  requested_count integer not null,
  mode text not null,
  background_prompt text not null,
  status text not null,
  error_message text null,
  duration_ms integer null,
  constraint generation_jobs_status_check check (status in ('running', 'success', 'error')),
  constraint generation_jobs_requested_count_check check (requested_count between 1 and 4),
  constraint generation_jobs_mode_check check (mode in ('general-sale', 'gift-set'))
);

create index if not exists generation_jobs_client_created_idx
on generation_jobs (client_key_hash, created_at desc);

alter table generation_jobs
add column if not exists user_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generation_jobs_user_id_fkey'
  ) then
    alter table generation_jobs
    add constraint generation_jobs_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete set null;
  end if;
end $$;

create index if not exists generation_jobs_user_created_idx
on generation_jobs (user_id, created_at desc);
