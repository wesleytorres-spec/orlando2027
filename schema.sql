-- Orlando 2027 — banco da família
-- Cole tudo no SQL Editor do Supabase e clique em Run (uma vez só).

create table if not exists public.estado (
  chave      text primary key,          -- ex.: check:c5, status:vineland, plano:3
  valor      jsonb,
  por        text,                      -- nome de quem alterou
  atualizado timestamptz not null default now()
);

alter table public.estado enable row level security;

-- Só quem entrou com o código da família (usuário autenticado) lê e escreve.
drop policy if exists "familia_le" on public.estado;
drop policy if exists "familia_insere" on public.estado;
drop policy if exists "familia_atualiza" on public.estado;
drop policy if exists "familia_apaga" on public.estado;
create policy "familia_le"       on public.estado for select to authenticated using (true);
create policy "familia_insere"   on public.estado for insert to authenticated with check (true);
create policy "familia_atualiza" on public.estado for update to authenticated using (true) with check (true);
create policy "familia_apaga"    on public.estado for delete to authenticated using (true);

-- Atualização em tempo real entre os celulares.
alter publication supabase_realtime add table public.estado;
