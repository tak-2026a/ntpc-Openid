-- Run once in Supabase SQL Editor after schema.sql and seating.sql.
-- Each row is one attendance, late-arrival, or +1 participation record.
create table if not exists public.student_attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  record_date date not null default current_date,
  record_type text not null check (record_type in ('leave', 'late', 'bonus')),
  reason text check (reason is null or char_length(reason) <= 500),
  points integer not null default 0 check (
    (record_type = 'bonus' and points = 1) or
    (record_type in ('leave', 'late') and points = 0)
  ),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists student_attendance_records_class_date_idx
  on public.student_attendance_records (class_id, record_date);
create index if not exists student_attendance_records_student_idx
  on public.student_attendance_records (student_id, record_date);

-- Browser clients cannot access this table directly. The server verifies the
-- logged-in teacher's class access before each read, add, or removal.
alter table public.student_attendance_records enable row level security;
