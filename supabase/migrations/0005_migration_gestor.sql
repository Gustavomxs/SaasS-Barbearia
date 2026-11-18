-- =====================================================================
-- R10 Barbearia — migration_gestor.sql (0005): Painel Gestor do dono (/gestor)
-- SEGURO: só acrescenta colunas/funções; não apaga nenhum dado existente.
-- =====================================================================

-- configurações da barbearia que o site lê (dono edita no /gestor)
alter table public.configuracoes
  add column if not exists aberta      boolean not null default true,     -- Fechada = o site para de oferecer horários
  add column if not exists whatsapp    text    not null default '5543999850351',
  add column if not exists instagram   text    not null default 'r10._barbearia',
  add column if not exists aviso_texto text,                               -- banner promocional no topo do site
  add column if not exists aviso_ativo boolean not null default false;

-- agendamento: "Confirmar" (sem mexer no status, para não afetar a trava de horários)
alter table public.agendamentos add column if not exists confirmado_em timestamptz;

-- horários livres: barbearia fechada = nenhum horário
create or replace function public.horarios_livres(
  p_unidade text, p_profissional text, p_data date, p_servicos text[])
returns table (hora text, profissionais text[])
language plpgsql stable security definer set search_path = public as $$
declare
  v_dur  int := public.duracao_servicos(p_servicos);
  v_tz   text := 'America/Sao_Paulo';
  v_hoje date := (now() at time zone v_tz)::date;
  v_cfg  public.configuracoes;
begin
  select * into v_cfg from public.configuracoes;
  if not v_cfg.aberta or v_dur = 0 or p_data < v_hoje or p_data > v_hoje + v_cfg.dias_a_frente or public.dia_fechado(p_data) then
    return;
  end if;
  return query
  with alvo as (
    select p.id, p.almoco_inicio, p.almoco_fim from public.profissionais p
    where p.ativo and p.unidade_id = p_unidade
      and (p_profissional = 'qualquer' or p.id = p_profissional)
  ),
  candidatos as (
    select a.id as prof, a.almoco_inicio, a.almoco_fim,
           (s.ts at time zone v_tz) as ini,
           (s.ts at time zone v_tz) + make_interval(mins => v_dur) as fim,
           s.ts as ts_local,
           to_char(s.ts, 'HH24:MI') as hhmm
    from alvo a
    join public.expedientes e on e.profissional_id = a.id and e.dia_semana = extract(dow from p_data)::int
    cross join lateral generate_series(p_data + e.inicio,
                                       p_data + e.fim - make_interval(mins => v_dur),
                                       interval '30 minutes') as s(ts)
  )
  select c.hhmm, array_agg(c.prof order by c.prof)
  from candidatos c
  where c.ini >= now() + make_interval(mins => v_cfg.antecedencia_min)
    and (c.almoco_inicio is null or c.almoco_fim is null
         or not tsrange(c.ts_local, c.ts_local + make_interval(mins => v_dur), '[)')
                && tsrange(p_data + c.almoco_inicio, p_data + c.almoco_fim, '[)'))
    and not exists (select 1 from public.agendamentos ag
                    where ag.profissional_id = c.prof and ag.status = 'agendado'
                      and tstzrange(ag.inicio, ag.fim, '[)') && tstzrange(c.ini, c.fim, '[)'))
    and not exists (select 1 from public.bloqueios b
                    where (b.profissional_id is null or b.profissional_id = c.prof)
                      and tstzrange(b.inicio, b.fim, '[)') && tstzrange(c.ini, c.fim, '[)'))
  group by c.hhmm
  order by c.hhmm;
end $$;

-- o site lê os expedientes de todos (já é público) e os serviços/profissionais ativos (já é público).
-- o dono (admin) já pode editar tudo pelas regras "equipe_*" da 0001.

-- tempo real também para serviços, equipe e configurações (o site e o gestor atualizam sozinhos)
alter publication supabase_realtime add table public.servicos;
alter publication supabase_realtime add table public.profissionais;
alter publication supabase_realtime add table public.configuracoes;

grant execute on function public.horarios_livres(text,text,date,text[]) to anon, authenticated;

-- fotos da equipe: pasta pública (o site mostra), só o dono envia/troca/apaga
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipe', 'equipe', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy equipe_fotos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'equipe' and public.eh_admin());
create policy equipe_fotos_trocar on storage.objects for update to authenticated using (bucket_id = 'equipe' and public.eh_admin()) with check (bucket_id = 'equipe' and public.eh_admin());
create policy equipe_fotos_apagar on storage.objects for delete to authenticated using (bucket_id = 'equipe' and public.eh_admin());

-- "Concluído (pago)": ao concluir, o pagamento na barbearia conta como pago; desfazer volta
create or replace function public.painel_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ag public.agendamentos;
begin
  if p_status not in ('concluido','cancelado','falta','agendado') then raise exception 'status'; end if;
  select * into v_ag from public.agendamentos where id = p_id for update;
  if not found then raise exception 'nao_encontrado'; end if;
  if not (public.eh_admin() or v_ag.profissional_id = public.meu_profissional()) then raise exception 'permissao'; end if;
  update public.agendamentos
     set status = p_status,
         cancelado_em  = case when p_status = 'cancelado' then now() else null end,
         cancelado_por = case when p_status = 'cancelado' then 'barbearia' else null end,
         pagamento_status = case
           when p_status = 'concluido' and pagamento_status = 'na_barbearia' then 'pago'
           when p_status = 'agendado' and pagamento_status = 'pago' and v_ag.status = 'concluido' then 'na_barbearia'
           else pagamento_status end
   where id = p_id;
  if p_status = 'cancelado' then
    update public.cupons set usado_em = null, agendamento_id = null where agendamento_id = p_id and expira_em > now();
  end if;
end $$;
revoke execute on function public.painel_status(uuid,text) from public, anon, authenticated;
grant execute on function public.painel_status(uuid,text) to authenticated;
