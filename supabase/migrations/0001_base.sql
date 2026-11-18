-- =====================================================================
-- R10 Barbearia — 0001: base (login, perfil, agenda, regras de acesso)
-- Rodar UMA vez no Supabase: SQL Editor → New query → colar tudo → Run.
-- Fuso de referência: America/Sao_Paulo (horário de Brasília).
-- Segurança: RLS ligada em TODAS as tabelas. O site só usa a chave pública
-- (anon); cada pessoa só enxerga e altera o que é dela.
-- =====================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;
create extension if not exists pg_net;      -- avisa o Google Agenda (Apps Script) quando alguém agenda/cancela

-- ---------------------------------------------------------------------
-- EQUIPE (dono e quem ele autorizar): acesso ao painel do dono
-- ---------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade
);

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES (uma linha só). Prazo de cancelamento, limites etc.
-- ---------------------------------------------------------------------
create table public.configuracoes (
  id                    boolean primary key default true check (id),
  prazo_cancelar_horas  int     not null default 2  check (prazo_cancelar_horas between 0 and 72),
  max_futuros           int     not null default 2  check (max_futuros between 1 and 10),
  dias_a_frente         int     not null default 21 check (dias_a_frente between 1 and 90),
  antecedencia_min      int     not null default 30 check (antecedencia_min between 0 and 1440),
  pagamento_online      boolean not null default false,       -- etapa do Asaas
  reserva_minutos       int     not null default 10 check (reserva_minutos between 3 and 60),
  sinal_centavos        int     not null default 0  check (sinal_centavos >= 0)   -- futuro: taxa de agendamento
);
insert into public.configuracoes default values;

-- integração com o Google Agenda: endereço do Apps Script + senha combinada.
-- Tabela SEM nenhuma regra de leitura: ninguém lê pelo site, só as funções do banco.
create table public.integracoes (
  id              boolean primary key default true check (id),
  agenda_url      text,
  agenda_segredo  text
);
insert into public.integracoes default values;

-- ---------------------------------------------------------------------
-- CATÁLOGO (leitura pública dos itens ativos)
-- ---------------------------------------------------------------------
create table public.unidades (
  id        text primary key,
  nome      text not null,
  endereco  text not null,
  maps_url  text,
  ordem     int  not null default 0,
  ativo     boolean not null default true
);

create table public.profissionais (
  id          text primary key,
  unidade_id  text not null references public.unidades,
  nome        text not null,
  foto_url    text,
  ordem       int  not null default 0,
  ativo       boolean not null default true
);

-- dados internos do barbeiro (e-mail para convite, conta Asaas e % do split): só a equipe vê
create table public.profissionais_privado (
  profissional_id  text primary key references public.profissionais on delete cascade,
  email_google     text,
  eh_dono          boolean not null default false,
  asaas_wallet_id  text,
  percentual_split numeric(5,2) check (percentual_split is null or percentual_split between 0 and 100)
);

create table public.expedientes (
  profissional_id text not null references public.profissionais on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  inicio          time not null,
  fim             time not null check (fim > inicio),
  primary key (profissional_id, dia_semana, inicio)
);

create table public.servicos (
  id              text primary key,
  nome            text not null,
  preco_centavos  int  not null check (preco_centavos >= 0),
  duracao_min     int  not null check (duracao_min > 0),
  destaque        boolean not null default false,
  ordem           int  not null default 0,
  ativo           boolean not null default true
);

create table public.planos (
  id              text primary key,
  nome            text not null,
  preco_centavos  int  not null check (preco_centavos >= 0),
  vigencia        text not null default 'Indeterminado',
  ordem           int  not null default 0,
  ativo           boolean not null default true
);

-- folgas, almoço, ausências (por barbeiro, ou da equipe toda quando profissional_id é nulo)
create table public.bloqueios (
  id               uuid primary key default gen_random_uuid(),
  profissional_id  text references public.profissionais on delete cascade,
  inicio           timestamptz not null,
  fim              timestamptz not null check (fim > inicio),
  motivo           text
);

-- datas fechadas além dos feriados nacionais (ex.: feriado municipal)
create table public.feriados_extras (
  data    date primary key,
  motivo  text
);

-- ---------------------------------------------------------------------
-- DADOS DO CLIENTE (cada um só vê o próprio)
-- ---------------------------------------------------------------------
create table public.perfis (
  id                uuid primary key references auth.users on delete cascade,
  email             text,
  nome              text check (char_length(nome) <= 80),
  telefone          text check (telefone is null or telefone ~ '^\d{10,11}$'),
  nascimento        date,
  cpf               text check (cpf is null or cpf ~ '^\d{11}$'),
  cep               text check (cep is null or cep ~ '^\d{8}$'),
  rua               text check (char_length(rua) <= 120),
  numero            text check (char_length(numero) <= 10),
  complemento       text check (char_length(complemento) <= 60),
  bairro            text check (char_length(bairro) <= 60),
  cidade            text check (char_length(cidade) <= 60),
  uf                char(2),
  foto_path         text check (foto_path is null or foto_path ~ '^[0-9a-f-]{36}/'),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table public.agendamentos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references auth.users on delete cascade,
  unidade_id        text not null references public.unidades,
  profissional_id   text not null references public.profissionais,
  inicio            timestamptz not null,
  fim               timestamptz not null check (fim > inicio),
  status            text not null default 'agendado'
                      check (status in ('agendado','cancelado','concluido','falta')),
  total_centavos    int  not null check (total_centavos >= 0),
  pagamento_status  text not null default 'na_barbearia'
                      check (pagamento_status in ('na_barbearia','pendente','pago','reembolsado')),
  nome_cliente      text not null,
  telefone_cliente  text not null,
  criado_em         timestamptz not null default now(),
  cancelado_em      timestamptz,
  cancelado_por     text check (cancelado_por in ('cliente','barbearia')),
  -- trava: o mesmo barbeiro nunca tem dois horários sobrepostos
  constraint sem_conflito exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim, '[)') with &&
  ) where (status = 'agendado')
);
create index agendamentos_cliente_idx on public.agendamentos (cliente_id, inicio desc);

create table public.agendamento_servicos (
  agendamento_id  uuid not null references public.agendamentos on delete cascade,
  servico_id      text not null references public.servicos,
  nome            text not null,
  preco_centavos  int  not null,
  duracao_min     int  not null,
  primary key (agendamento_id, servico_id)
);

create table public.assinaturas (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references auth.users on delete cascade,
  plano_id    text not null references public.planos,
  status      text not null check (status in ('pendente','ativa','inativa','vencida','cancelada')),
  inicio      date,
  fim         date,
  origem      text,
  criado_em   timestamptz not null default now()
);

-- perfil criado sozinho no cadastro, com nome e telefone informados na hora
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tel text := regexp_replace(coalesce(new.raw_user_meta_data->>'telefone', ''), '\D', '', 'g');
begin
  insert into public.perfis (id, email, nome, telefone)
  values (new.id, new.email,
          nullif(left(trim(coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', '')), 80), ''),
          case when v_tel ~ '^\d{10,11}$' then v_tel end)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

create or replace function public.tocar_atualizado()
returns trigger language plpgsql set search_path = public as $$ begin new.atualizado_em := now(); return new; end $$;
create trigger perfis_atualizado before update on public.perfis
  for each row execute function public.tocar_atualizado();

-- ---------------------------------------------------------------------
-- REGRAS DE ACESSO (RLS) — ligadas em todas as tabelas
-- ---------------------------------------------------------------------
alter table public.admins                enable row level security;
alter table public.configuracoes         enable row level security;
alter table public.integracoes           enable row level security;   -- sem regras = ninguém lê pelo site
alter table public.unidades              enable row level security;
alter table public.profissionais         enable row level security;
alter table public.profissionais_privado enable row level security;
alter table public.expedientes           enable row level security;
alter table public.servicos              enable row level security;
alter table public.planos                enable row level security;
alter table public.bloqueios             enable row level security;
alter table public.feriados_extras       enable row level security;
alter table public.perfis                enable row level security;
alter table public.agendamentos          enable row level security;
alter table public.agendamento_servicos  enable row level security;
alter table public.assinaturas           enable row level security;

-- catálogo e configurações públicas: todos leem; só a equipe altera
create policy ler_config        on public.configuracoes for select using (true);
create policy ler_unidades      on public.unidades      for select using (ativo or public.eh_admin());
create policy ler_profissionais on public.profissionais for select using (ativo or public.eh_admin());
create policy ler_expedientes   on public.expedientes   for select using (true);
create policy ler_servicos      on public.servicos      for select using (ativo or public.eh_admin());
create policy ler_planos        on public.planos        for select using (ativo or public.eh_admin());
create policy ler_feriados      on public.feriados_extras for select using (true);

create policy equipe_config        on public.configuracoes         for update using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_unidades      on public.unidades              for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_profissionais on public.profissionais         for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_prof_privado  on public.profissionais_privado for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_expedientes   on public.expedientes           for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_servicos      on public.servicos              for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_planos        on public.planos                for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_bloqueios     on public.bloqueios             for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_feriados      on public.feriados_extras       for all using (public.eh_admin()) with check (public.eh_admin());
create policy equipe_admins        on public.admins                for select using (public.eh_admin());

-- perfil: só a própria pessoa lê e altera (a criação é automática)
create policy perfil_ler    on public.perfis for select using (id = auth.uid() or public.eh_admin());
create policy perfil_editar on public.perfis for update using (id = auth.uid()) with check (id = auth.uid());
-- e só estes campos podem ser alterados pelo site (e-mail e datas não)
revoke update on public.perfis from anon, authenticated;
grant update (nome, telefone, nascimento, cpf, cep, rua, numero, complemento, bairro, cidade, uf, foto_path)
  on public.perfis to authenticated;

-- agendamentos: o cliente só LÊ os próprios; criar e cancelar só pelas funções abaixo
create policy agend_ler     on public.agendamentos for select using (cliente_id = auth.uid() or public.eh_admin());
create policy agend_equipe  on public.agendamentos for update using (public.eh_admin()) with check (public.eh_admin());
create policy agserv_ler    on public.agendamento_servicos for select using (
  exists (select 1 from public.agendamentos a where a.id = agendamento_id and (a.cliente_id = auth.uid() or public.eh_admin())));

create policy assin_ler     on public.assinaturas for select using (cliente_id = auth.uid() or public.eh_admin());
create policy assin_equipe  on public.assinaturas for all    using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- FOTO DO PERFIL: pasta privada por pessoa  (fotos/<id-da-pessoa>/arquivo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()));
create policy fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy fotos_trocar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- FERIADOS NACIONAIS (qualquer ano, com Sexta-feira Santa)
-- ---------------------------------------------------------------------
create or replace function public.pascoa(ano int)
returns date language plpgsql immutable set search_path = public as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := ano % 19; b := ano / 100; c := ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25;
  g := (b - f + 1) / 3; h := (19*a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2*e + 2*i - h - k) % 7; m := (a + 11*h + 22*l) / 451;
  mes := (h + l - 7*m + 114) / 31; dia := ((h + l - 7*m + 114) % 31) + 1;
  return make_date(ano, mes, dia);
end $$;

create or replace function public.dia_fechado(p_data date)
returns boolean language sql stable set search_path = public as $$
  select extract(dow from p_data) = 0
      or to_char(p_data, 'MM-DD') in ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25')
      or p_data = public.pascoa(extract(year from p_data)::int) - 2
      or exists (select 1 from public.feriados_extras fe where fe.data = p_data);
$$;

-- ---------------------------------------------------------------------
-- MOTOR DE AGENDA
-- ---------------------------------------------------------------------
-- duração somada dos serviços, arredondada para blocos de 30 min
create or replace function public.duracao_servicos(p_servicos text[])
returns int language sql stable set search_path = public as $$
  select (ceil(coalesce(sum(duracao_min), 0) / 30.0) * 30)::int
  from public.servicos where id = any(p_servicos) and ativo;
$$;

-- horários livres de um dia. p_profissional = 'qualquer' junta a equipe da unidade.
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
    select p.id from public.profissionais p
    where p.ativo and p.unidade_id = p_unidade
      and (p_profissional = 'qualquer' or p.id = p_profissional)
  ),
  candidatos as (
    select a.id as prof,
           (s.ts at time zone v_tz) as ini,
           (s.ts at time zone v_tz) + make_interval(mins => v_dur) as fim,
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
    and not exists (select 1 from public.agendamentos ag
                    where ag.profissional_id = c.prof and ag.status = 'agendado'
                      and tstzrange(ag.inicio, ag.fim, '[)') && tstzrange(c.ini, c.fim, '[)'))
    and not exists (select 1 from public.bloqueios b
                    where (b.profissional_id is null or b.profissional_id = c.prof)
                      and tstzrange(b.inicio, b.fim, '[)') && tstzrange(c.ini, c.fim, '[)'))
  group by c.hhmm
  order by c.hhmm;
end $$;

-- avisa o Apps Script (Google Agenda + e-mails). Só roda por dentro das outras funções.
create or replace function public.avisar_agenda(p_id uuid, p_acao text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_int public.integracoes; v_dados jsonb;
begin
  select * into v_int from public.integracoes;
  if v_int.agenda_url is null or v_int.agenda_segredo is null then return; end if;
  select jsonb_build_object(
           'acao', 'espelho', 'evento', p_acao, 'segredo', v_int.agenda_segredo,
           'id', a.id, 'inicio', a.inicio, 'fim', a.fim, 'total_centavos', a.total_centavos,
           'profissional', a.profissional_id, 'profissional_nome', pr.nome,
           'unidade', u.nome, 'endereco', u.endereco,
           'nome', a.nome_cliente, 'telefone', a.telefone_cliente, 'email', pe.email,
           'servicos', (select coalesce(jsonb_agg(s.nome order by s.nome), '[]'::jsonb) from public.agendamento_servicos s where s.agendamento_id = a.id),
           'cancelado_por', a.cancelado_por)
    into v_dados
  from public.agendamentos a
  join public.profissionais pr on pr.id = a.profissional_id
  join public.unidades u on u.id = a.unidade_id
  left join public.perfis pe on pe.id = a.cliente_id
  where a.id = p_id;
  if v_dados is null then return; end if;
  perform net.http_post(url := v_int.agenda_url, body := v_dados,
                        headers := '{"Content-Type":"application/json"}'::jsonb);
end $$;

-- agendar: tudo calculado e conferido aqui. Erros: login, dados, servico, horario, limite, ocupado
create or replace function public.agendar(
  p_unidade text, p_profissional text, p_servicos text[], p_data date, p_hora text,
  p_nome text, p_telefone text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text := 'America/Sao_Paulo';
  v_tel   text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_dur   int;
  v_total int;
  v_profs text[];
  v_prof  text;
  v_ini   timestamptz;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'login'; end if;
  if char_length(trim(coalesce(p_nome,''))) < 2 or v_tel !~ '^\d{10,11}$' then raise exception 'dados'; end if;
  if coalesce(array_length(p_servicos, 1), 0) = 0
     or (select count(*) from public.servicos where id = any(p_servicos) and ativo) <> array_length(p_servicos, 1) then
    raise exception 'servico';
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
    insert into public.agendamentos (cliente_id, unidade_id, profissional_id, inicio, fim, total_centavos, nome_cliente, telefone_cliente)
    values (v_uid, p_unidade, v_prof, v_ini, v_ini + make_interval(mins => v_dur), v_total, left(trim(p_nome), 80), v_tel)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'ocupado';
  end;

  insert into public.agendamento_servicos (agendamento_id, servico_id, nome, preco_centavos, duracao_min)
  select v_id, s.id, s.nome, s.preco_centavos, s.duracao_min from public.servicos s where s.id = any(p_servicos);

  update public.perfis set telefone = coalesce(telefone, v_tel), nome = coalesce(nullif(nome, ''), left(trim(p_nome), 80))
  where id = v_uid;

  perform public.avisar_agenda(v_id, 'criado');

  return json_build_object('id', v_id, 'profissional', v_prof,
                           'profissional_nome', (select nome from public.profissionais where id = v_prof),
                           'inicio', v_ini, 'fim', v_ini + make_interval(mins => v_dur),
                           'total_centavos', v_total, 'duracao_min', v_dur);
end $$;

-- cancelar pelo site: só o dono do horário e só até o prazo (padrão 2 h antes, horário de Brasília)
create or replace function public.cancelar_agendamento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ag public.agendamentos; v_prazo int;
begin
  select * into v_ag from public.agendamentos where id = p_id and cliente_id = auth.uid() and status = 'agendado' for update;
  if not found then raise exception 'nao_encontrado'; end if;
  select prazo_cancelar_horas into v_prazo from public.configuracoes;
  if v_ag.inicio <= now() + make_interval(hours => v_prazo) then raise exception 'prazo'; end if;
  update public.agendamentos set status = 'cancelado', cancelado_em = now(), cancelado_por = 'cliente' where id = p_id;
  perform public.avisar_agenda(p_id, 'cancelado');
end $$;

-- ---------------------------------------------------------------------
-- PERMISSÕES DAS FUNÇÕES (o Supabase libera tudo por padrão: aqui fechamos)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.eh_admin()                                   to anon, authenticated;
grant execute on function public.dia_fechado(date)                            to anon, authenticated;
grant execute on function public.pascoa(int)                                  to anon, authenticated;
grant execute on function public.duracao_servicos(text[])                     to anon, authenticated;
grant execute on function public.horarios_livres(text,text,date,text[])       to anon, authenticated;
grant execute on function public.agendar(text,text,text[],date,text,text,text) to authenticated;
grant execute on function public.cancelar_agendamento(uuid)                   to authenticated;
-- avisar_agenda, novo_usuario e tocar_atualizado ficam fechadas: só o próprio banco usa

-- ---------------------------------------------------------------------
-- DADOS REAIS DA R10
-- ---------------------------------------------------------------------
insert into public.unidades (id, nome, endereco, maps_url, ordem) values
  ('cidade-alta', 'Cidade Alta', 'Rua Prefeito Aldo Sampaio Ribas, 355 – Cidade Alta, Jaguariaíva – PR',
   'https://www.google.com/maps/search/?api=1&query=R10+Barbearia+Rua+Prefeito+Aldo+Sampaio+Ribas+355+Cidade+Alta+Jaguaria%C3%ADva+PR', 1),
  ('fluviopolis', 'Fluviopolis', 'Rua Domingos Scolario, Sala 2', null, 2);

insert into public.profissionais (id, unidade_id, nome, foto_url, ordem) values
  ('jose',      'cidade-alta', 'José',        '/assets/barbeiros/jose.jpg',      1),
  ('rhequelmy', 'fluviopolis', 'Rhequelmy L', '/assets/barbeiros/rhequelmy.jpg', 1),
  ('fabio',     'fluviopolis', 'Fabio',       '/assets/barbeiros/fabio.jpg',     2);
insert into public.profissionais_privado (profissional_id) values ('jose'), ('rhequelmy'), ('fabio');

insert into public.expedientes (profissional_id, dia_semana, inicio, fim)
select 'jose', d::smallint, time '13:00', time '19:30' from generate_series(1,5) d
union all select 'jose', 6::smallint, time '09:00', time '17:30'
union all select p, d::smallint, time '09:00', time '19:30' from unnest(array['rhequelmy','fabio']) p, generate_series(1,5) d
union all select p, 6::smallint, time '09:00', time '15:30' from unnest(array['rhequelmy','fabio']) p;

-- DURAÇÕES A CONFIRMAR com a barbearia (hoje 30 min cada)
insert into public.servicos (id, nome, preco_centavos, duracao_min, destaque, ordem) values
  ('corte',                  'Corte',                      3500, 30, true,  1),
  ('cabelo-e-barba',         'Cabelo e barba',             5500, 30, false, 2),
  ('barba',                  'Barba',                      3000, 30, false, 3),
  ('sobrancelha-navalha',    'Sobrancelha na Navalha',      500, 30, false, 4),
  ('pigmentacao-e-corte',    'Pigmentação e corte',        5000, 30, false, 5),
  ('pigmentacao-preta',      'Pigmentação Preta',          5000, 30, false, 6),
  ('pigmentacao-sobrancelha','Pigmentação na sobrancelha', 1500, 30, false, 7),
  ('alisamento-americano',   'Alisamento americano',       2500, 30, false, 8),
  ('selagem-e-corte',        'Selagem e corte',           10000, 30, false, 9),
  ('platinado-nevou',        'Platinado/Nevou',           12000, 30, false, 10),
  ('luzes',                  'Luzes',                     12000, 30, false, 11);

insert into public.planos (id, nome, preco_centavos, vigencia, ordem) values
  ('corte-ilimitado',          'Plano Corte Ilimitado',    9500,  'Indeterminado', 1),
  ('cabelo-barba-ilimitado',   'Cabelo e barba ilimitado', 13000, 'Indeterminado', 2);
