-- Run once in Supabase SQL Editor after supabase/schema.sql.
-- Stores a teacher-adjustable seating plan for each class.
create table if not exists public.class_seat_assignments (
  class_id uuid not null references public.classes(id) on delete cascade,
  seat_key text not null,
  student_id uuid references public.students(id) on delete set null,
  position_x numeric(5,2) not null check (position_x >= 0 and position_x <= 100),
  position_y numeric(5,2) not null check (position_y >= 0 and position_y <= 100),
  updated_at timestamptz not null default now(),
  primary key (class_id, seat_key),
  unique (class_id, student_id)
);

create index if not exists class_seat_assignments_student_idx
  on public.class_seat_assignments (student_id);

alter table public.class_seat_assignments enable row level security;
