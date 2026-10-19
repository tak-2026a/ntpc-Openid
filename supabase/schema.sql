-- Run this in Supabase Dashboard > SQL Editor.  Do not put student records in GitHub.
create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  openid_identity text not null unique,
  display_name text not null,
  openid_roles jsonb not null default '[]'::jsonb,
  student_code text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token_hash text primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_year text not null,
  grade smallint not null check (grade between 1 and 12),
  class_number smallint not null check (class_number between 1 and 99),
  subject text not null,
  source_sheet text,
  created_at timestamptz not null default now(),
  unique (school_year, grade, class_number, subject)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_year text not null,
  grade smallint not null check (grade between 1 and 12),
  class_number smallint not null check (class_number between 1 and 99),
  seat_number smallint not null check (seat_number between 1 and 99),
  student_code text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  unique (school_year, grade, class_number, seat_number),
  unique (school_year, student_code)
);

create table if not exists public.class_enrollments (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (class_id, student_id)
);

create table if not exists public.teacher_class_access (
  user_id uuid not null references public.app_users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, class_id)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  max_score numeric(6,2),
  assessment_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric(6,2),
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);

create index if not exists app_sessions_expiry_idx on public.app_sessions (expires_at);
create index if not exists enrollments_student_idx on public.class_enrollments (student_id);
create index if not exists teacher_class_access_class_idx on public.teacher_class_access (class_id);

-- No browser client can read these tables.  The server uses the service-role key
-- and performs the authorization checks in api/index.js.
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.teacher_class_access enable row level security;
alter table public.assessments enable row level security;
alter table public.scores enable row level security;
