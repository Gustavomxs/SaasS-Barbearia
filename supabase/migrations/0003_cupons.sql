-- =====================================================================
-- R10 Barbearia — 0003: CUPONS do Clube (sorteios do Instagram)
--  · o dono cria o código e o prêmio (serviço grátis, plano grátis ou outro prêmio)
--  · quem tem conta resgata (uso único: o primeiro que resgatar leva)
--  · cupom de serviço: vale para 1 agendamento daquele serviço de graça
--  · cupom de plano: ativa o plano na hora pelo número de dias do cupom
--  · cada pessoa só vê os cupons que ela resgatou; códigos não resgatados ficam escondidos
-- =====================================================================

create table public.cupons (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique check (codigo ~ '^[A-Z0-9_-]{3,24}$'),
  premio         text not null check (char_length(premio) between 2 and 80),
  tipo           text not null check (tipo in ('servico','plano','outro')),
  servico_id     text references public.servicos,
  plano_id       text references public.planos,
  dias_validade  int  not null default 30 check (dias_validade between 1 and 365),   -- depois do resgate
  resgatar_ate   date,                                                              -- prazo para resgatar o código
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  resgatado_por  uuid references public.perfis(id) on delete set null,
  resgatado_em   timestamptz,
  expira_em      timestamptz,
  usado_em       timestamptz,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  check (tipo <> 'servico' or servico_id is not null),
  check (tipo <> 'plano'   or plano_id   is not null)
);

alter table public.agendamentos
  add column cupom_id uuid references public.cupons(id) on delete set null,
  add column desconto_centavos int not null default 0 check (desconto_centavos >= 0);

-- tentativas de resgate (contra quem fica chutando códigos)
create table public.cupom_tentativas (
  id      bigint generated always as identity primary key,
  usuario uuid not null,
  em      timestamptz not null default now()
);
create index cupom_tentativas_idx on public.cupom_tentativas (usuario, em);

alter table public.cupons           enable row level security;
alter table public.cupom_tentativas enable row level security;     -- sem regras: só as funções usam
create policy cupom_ler    on public.cupons for select using (resgatado_por = auth.uid() or public.eh_admin());
create policy cupom_equipe on public.cupons for all    using (public.eh_admin()) with check (public.eh_admin());

-- RESGATAR: devolve { ok, erro? , premio, tipo, expira_em }. Não usa "raise" nos erros
-- para que a tentativa fique registrada mesmo quando o código é inválido.
create or replace function public.resgatar_cupom(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_cod  text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c    public.cupons;
  v_ass  public.assinaturas;
begin
  if v_uid is null then return json_build_object('ok', false, 'erro', 'login'); end if;
  if (select count(*) from public.cupom_tentativas where usuario = v_uid and em > now() - interval '1 hour') >= 10 then
    return json_build_object('ok', false, 'erro', 'tentativas');
  end if;
  insert into public.cupom_tentativas (usuario) values (v_uid);

  select * into v_c from public.cupons where codigo = v_cod for update;
  if not found or not v_c.ativo then return json_build_object('ok', false, 'erro', 'invalido'); end if;
  if v_c.resgatado_por is not null then
    return json_build_object('ok', false, 'erro', case when v_c.resgatado_por = v_uid then 'seu' else 'usado' end);
  end if;
  if v_c.resgatar_ate is not null and v_c.resgatar_ate < v_hoje then return json_build_object('ok', false, 'erro', 'vencido'); end if;

  update public.cupons set resgatado_por = v_uid, resgatado_em = now(),
         expira_em = now() + make_interval(days => v_c.dias_validade)
   where id = v_c.id returning * into v_c;

  -- plano grátis: ativa (ou estende) o plano agora
  if v_c.tipo = 'plano' then
    select * into v_ass from public.assinaturas
     where cliente_id = v_uid and status = 'ativa' order by fim desc nulls last limit 1 for update;
    if found then
      update public.assinaturas set fim = greatest(coalesce(fim, v_hoje), v_hoje) + v_c.dias_validade where id = v_ass.id;
    else
      insert into public.assinaturas (cliente_id, plano_id, status, inicio, fim, origem)
      values (v_uid, v_c.plano_id, 'ativa', v_hoje, v_hoje + v_c.dias_validade, 'cupom');
    end if;
    update public.cupons set usado_em = now() where id = v_c.id;
  end if;

  return json_build_object('ok', true, 'premio', v_c.premio, 'tipo', v_c.tipo, 'expira_em', v_c.expira_em);
end $$;

-- AGENDAR com cupom opcional (serviço grátis). Substitui a versão da 0001.
drop function if exists public.agendar(text,text,text[],date,text,text,text);
create or replace function public.agendar(
  p_unidade text, p_profissional text, p_servicos text[], p_data date, p_hora text,
  p_nome text, p_telefone text, p_cupom uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text := 'America/Sao_Paulo';
  v_tel   text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_dur   int;
  v_total int;
  v_desc  int := 0;
  v_profs text[];
  v_prof  text;
  v_ini   timestamptz;
  v_id    uuid;
  v_c     public.cupons;
begin
  if v_uid is null then raise exception 'login'; end if;
  if char_length(trim(coalesce(p_nome,''))) < 2 or v_tel !~ '^\d{10,11}$' then raise exception 'dados'; end if;
  if coalesce(array_length(p_servicos, 1), 0) = 0
     or (select count(*) from public.servicos where id = any(p_servicos) and ativo) <> array_length(p_servicos, 1) then
    raise exception 'servico';
  end if;

  if p_cupom is not null then
    select * into v_c from public.cupons
     where id = p_cupom and resgatado_por = v_uid and tipo = 'servico' and usado_em is null
       and expira_em > now() and servico_id = any(p_servicos)
     for update;
    if not found then raise exception 'cupom'; end if;
    select preco_centavos into v_desc from public.servicos where id = v_c.servico_id;
  end if;

  select coalesce(sum(preco_centavos),0) into v_total from public.servicos where id = any(p_servicos);
  v_dur := public.duracao_servicos(p_servicos);

  select h.profissionais into v_profs
  from public.horarios_livres(p_unidade, p_profissional, p_data, p_servicos) h
  where h.hora = p_hora;
  if v_profs is null then raise exception 'horario'; end if;
  v_prof := v_profs[1];

  if (select count(*) from public.agendamentos
      where cliente_id = v_uid and status = 'agendado' and inicio > now())
     >= (select max_futuros from public.configuracoes) then
    raise exception 'limite';
  end if;

  v_ini := (p_data + p_hora::time) at time zone v_tz;
  begin
    insert into public.agendamentos (cliente_id, unidade_id, profissional_id, inicio, fim, total_centavos, desconto_centavos, cupom_id, nome_cliente, telefone_cliente)
    values (v_uid, p_unidade, v_prof, v_ini, v_ini + make_interval(mins => v_dur), greatest(v_total - v_desc, 0), v_desc,
            case when p_cupom is not null then v_c.id end, left(trim(p_nome), 80), v_tel)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'ocupado';
  end;

  insert into public.agendamento_servicos (agendamento_id, servico_id, nome, preco_centavos, duracao_min)
  select v_id, s.id, s.nome, s.preco_centavos, s.duracao_min from public.servicos s where s.id = any(p_servicos);

  if p_cupom is not null then
    update public.cupons set usado_em = now(), agendamento_id = v_id where id = v_c.id;
  end if;

  update public.perfis set telefone = coalesce(telefone, v_tel), nome = coalesce(nullif(nome, ''), left(trim(p_nome), 80))
  where id = v_uid;

  perform public.avisar_agenda(v_id, 'criado');

  return json_build_object('id', v_id, 'profissional', v_prof,
                           'profissional_nome', (select nome from public.profissionais where id = v_prof),
                           'inicio', v_ini, 'fim', v_ini + make_interval(mins => v_dur),
                           'total_centavos', greatest(v_total - v_desc, 0), 'desconto_centavos', v_desc, 'duracao_min', v_dur);
end $$;

-- CANCELAR devolve o cupom (se ainda estiver na validade)
create or replace function public.cancelar_agendamento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ag public.agendamentos; v_prazo int;
begin
  select * into v_ag from public.agendamentos where id = p_id and cliente_id = auth.uid() and status = 'agendado' for update;
  if not found then raise exception 'nao_encontrado'; end if;
  select prazo_cancelar_horas into v_prazo from public.configuracoes;
  if v_ag.inicio <= now() + make_interval(hours => v_prazo) then raise exception 'prazo'; end if;
  update public.agendamentos set status = 'cancelado', cancelado_em = now(), cancelado_por = 'cliente' where id = p_id;
  update public.cupons set usado_em = null, agendamento_id = null where agendamento_id = p_id and expira_em > now();
  perform public.avisar_agenda(p_id, 'cancelado');
end $$;

revoke execute on function public.resgatar_cupom(text) from public, anon, authenticated;
revoke execute on function public.agendar(text,text,text[],date,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.resgatar_cupom(text) to authenticated;
grant execute on function public.agendar(text,text,text[],date,text,text,text,uuid) to authenticated;
grant execute on function public.cancelar_agendamento(uuid) to authenticated;
