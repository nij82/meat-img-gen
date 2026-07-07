create table if not exists user_openai_api_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_api_key text not null,
  api_key_last4 text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_openai_api_keys_updated_idx
on user_openai_api_keys (updated_at desc);
