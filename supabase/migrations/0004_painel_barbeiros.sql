-- =====================================================================
-- R10 Barbearia — 0004: painel dos barbeiros (/agenda), almoço, push e tempo real
-- Substitui o espelho no Google Agenda pelo painel próprio + notificação no celular.
-- =====================================================================

-- barbeiro: telefone e intervalo de almoço (opcional)
alter table public.profissionais
  add column if not exists telefone      text,
  add column if not exists almoco_inicio time,
  add column if not exists almoco_fim    time,
  add constraint almoco_valido check (almoco_inicio is null or almoco_fim is null or almoco_fim > almoco_inicio);

-- ligação conta ↔ barbeiro e o "endereço" de notificação do celular dele (só a equipe e ele mesmo, via funções)
alter table public.profissionais_privado
  add column if not exists usuario_id        uuid unique references auth.users on delete set null,
  add column if not exists push_subscription jsonb,
  add column if not exists push_salvo_em     timestamptz;

-- controle do aviso (cada agendamento notifica uma vez só)
alter table public.agendamentos add column if not exists push_enviado_em timestamptz;

-- endereço da API que dispara o push (ex.: https://r10-barbearia.vercel.app/api/notify-barber)
alter table public.integracoes add column if not exists push_url text;

-- qual barbeiro é a pessoa logada (null = não é barbeiro)
create or replace function public.meu_profissional()
returns text language sql stable security definer set search_path = public as $$
  select profissional_id from public.profissionais_privado where usuario_id = auth.uid() limit 1;
$$;

-- o painel pergunta: quem sou eu?
create or replace function public.meu_painel()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'admin', public.eh_admin(),
    'profissional', public.meu_profissional(),
    'nome', (select nome from public.profissionais where id = public.meu_profissional())
  );
$$;

-- ---------------------------------------------------------------------
-- REGRAS DE ACESSO para os barbeiros (o dono/admin já vê tudo)
-- ---------------------------------------------------------------------
create policy agend_barbeiro_ler on public.agendamentos for select
  using (profissional_id = public.meu_profissional());
create policy agserv_barbeiro_ler on public.agendamento_servicos for select
  using (exists (select 1 from public.agendamentos a where a.id = agendamento_id and a.profissional_id = public.meu_profissional()));
create policy bloq_barbeiro_ler on public.bloqueios for select
  using (public.eh_admin() or profissional_id is null or profissional_id = public.meu_profissional());
create policy bloq_barbeiro_criar on public.bloqueios for insert
  with check (profissional_id = public.meu_profissional());
create policy bloq_barbeiro_apagar on public.bloqueios for delete
  using (profissional_id = public.meu_profissional());

-- concluir / cancelar / falta pelo painel (barbeiro só nos próprios horários; admin em todos)
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
         cancelado_por = case when p_status = 'cancelado' then 'barbearia' else null end
   where id = p_id;
end $$;

-- salvar o celular para notificações: o barbeiro salva o dele; o admin pode salvar para qualquer barbeiro
create or replace function public.salvar_push(p_profissional text, p_sub jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sub is null or p_sub->>'endpoint' is null or p_sub->>'endpoint' !~ '^https://' then raise exception 'push'; end if;
  if not (public.eh_admin() or p_profissional = public.meu_profissional()) then raise exception 'permissao'; end if;
  update public.profissionais_privado set push_subscription = p_sub, push_salvo_em = now() where profissional_id = p_profissional;
  if not found then raise exception 'nao_encontrado'; end if;
end $$;

-- a API do push pede os dados do aviso. Só responde UMA vez por agendamento e só nos 5 minutos
-- seguintes à criação — assim ninguém consegue usar a API para mandar avisos repetidos.
create or replace function public.dados_push(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  update public.agendamentos set push_enviado_em = now()
   where id = p_id and push_enviado_em is null and criado_em > now() - interval '5 minutes';
  if not found then return null; end if;
  select json_build_object(
           'subscription', pp.push_subscription,
           'titulo', 'Novo Agendamento - R10',
           'corpo', 'Cliente: ' || a.nome_cliente || ' | ' ||
                    coalesce((select string_agg(s.nome, ', ' order by s.nome) from public.agendamento_servicos s where s.agendamento_id = a.id), 'Serviço') ||
                    ' às ' || to_char(a.inicio at time zone 'America/Sao_Paulo', 'HH24:MI') ||
                    ' (' || to_char(a.inicio at time zone 'America/Sao_Paulo', 'DD/MM') || ')',
           'profissional', a.profissional_id)
    into v
  from public.agendamentos a
  join public.profissionais_privado pp on pp.profissional_id = a.profissional_id
  where a.id = p_id;
  if v is null or (v->'subscription') is null or (v->>'subscription') = 'null' then return null; end if;
  return v;
end $$;

-- celular trocou/desinstalou: a API avisa e o endereço é apagado
create or replace function public.push_expirado(p_profissional text, p_endpoint text)
returns void language sql security definer set search_path = public as $$
  update public.profissionais_privado set push_subscription = null
   where profissional_id = p_profissional and push_subscription->>'endpoint' = p_endpoint;
$$;

-- ao criar um agendamento: chama a API do push (pg_net, sem travar o agendamento)
create or replace function public.chamar_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_url text;
begin
  select push_url into v_url from public.integracoes;
  if v_url is not null then
    perform net.http_post(url := v_url, body := jsonb_build_object('id', new.id),
                          headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
end $$;
create trigger push_novo_agendamento after insert on public.agendamentos
  for each row execute function public.chamar_push();

-- horários livres agora pulam o almoço do barbeiro
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
  if v_dur = 0 or p_data < v_hoje or p_data > v_hoje + v_cfg.dias_a_frente or public.dia_fechado(p_data) then
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

-- tempo real: o painel recebe novos agendamentos na hora (respeitando as regras de acesso)
alter publication supabase_realtime add table public.agendamentos;

-- o Google Agenda deixa de receber os eventos (o painel próprio substitui)
update public.integracoes set agenda_url = null where id;

-- permissões das funções
revoke execute on function public.meu_profissional() from public, anon, authenticated;
revoke execute on function public.meu_painel() from public, anon, authenticated;
revoke execute on function public.painel_status(uuid,text) from public, anon, authenticated;
revoke execute on function public.salvar_push(text,jsonb) from public, anon, authenticated;
revoke execute on function public.dados_push(uuid) from public, anon, authenticated;
revoke execute on function public.push_expirado(text,text) from public, anon, authenticated;
revoke execute on function public.chamar_push() from public, anon, authenticated;
grant execute on function public.meu_profissional() to anon, authenticated;   -- usada nas regras de acesso (para quem não é barbeiro, devolve vazio)
grant execute on function public.meu_painel() to authenticated;
grant execute on function public.painel_status(uuid,text) to authenticated;
grant execute on function public.salvar_push(text,jsonb) to authenticated;
grant execute on function public.dados_push(uuid) to anon, authenticated; -- a API chama sem login (resposta única e por 5 min)
grant execute on function public.push_expirado(text,text) to anon, authenticated;
grant execute on function public.horarios_livres(text,text,date,text[]) to anon, authenticated;
