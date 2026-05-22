-- Taboa de auditoria para as tarefas de Breogan
create table if not exists public.breogan_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  task_type text not null,
  status text default 'pending',
  latency_ms float,
  estimated_cost numeric(10, 5),
  payload jsonb,
  result jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indices para optimizar consultas por usuario e tipo de tarefa
create index if not exists idx_breogan_tasks_user on public.breogan_tasks(user_id);
create index if not exists idx_breogan_tasks_type on public.breogan_tasks(task_type);

alter table public.breogan_tasks enable row level security;

drop policy if exists "Users can view own tasks" on public.breogan_tasks;
drop policy if exists "Admins can view all tasks" on public.breogan_tasks;

create policy "Users can view own tasks" on public.breogan_tasks
  for select
  to authenticated
  using (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute $policy$
      create policy "Admins can view all tasks" on public.breogan_tasks
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.profiles
          where id = auth.uid() and role = 'admin'
        )
      )
    $policy$;
  end if;
end
$$;
