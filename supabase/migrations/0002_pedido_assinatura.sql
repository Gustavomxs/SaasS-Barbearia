-- =====================================================================
-- R10 Barbearia — 0002: pedido de assinatura pelo site (antes do pagamento online)
-- O cliente logado pede o plano; fica "pendente" até a R10 ativar.
-- Avisa o Apps Script (e-mail para a barbearia) do mesmo jeito que os agendamentos.
-- =====================================================================

create or replace function public.pedir_assinatura(p_plano text, p_nome text, p_telefone text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_tel text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  v_int public.integracoes;
  v_plano public.planos;
  v_id uuid;
begin
  if v_uid is null then raise exception 'login'; end if;
  if char_length(trim(coalesce(p_nome,''))) < 2 or v_tel !~ '^\d{10,11}$' then raise exception 'dados'; end if;
  select * into v_plano from public.planos where id = p_plano and ativo;
  if not found then raise exception 'plano'; end if;

  if exists (select 1 from public.assinaturas where cliente_id = v_uid and status = 'ativa') then return 'ja_ativa'; end if;

  -- um pedido pendente por pessoa: pedir de novo só troca o plano escolhido
  update public.assinaturas set plano_id = p_plano, criado_em = now()
   where cliente_id = v_uid and status = 'pendente' returning id into v_id;
  if v_id is null then
    insert into public.assinaturas (cliente_id, plano_id, status, origem) values (v_uid, p_plano, 'pendente', 'site')
    returning id into v_id;
  end if;

  update public.perfis set telefone = coalesce(telefone, v_tel), nome = coalesce(nullif(nome, ''), left(trim(p_nome), 80))
  where id = v_uid;

  select * into v_int from public.integracoes;
  if v_int.agenda_url is not null and v_int.agenda_segredo is not null then
    perform net.http_post(url := v_int.agenda_url,
      body := jsonb_build_object('acao', 'espelho', 'evento', 'assinatura', 'segredo', v_int.agenda_segredo,
                                 'id', v_id, 'plano', v_plano.nome, 'preco_centavos', v_plano.preco_centavos,
                                 'nome', left(trim(p_nome), 80), 'telefone', v_tel,
                                 'email', (select email from public.perfis where id = v_uid)),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return 'ok';
end $$;

revoke execute on function public.pedir_assinatura(text,text,text) from public, anon, authenticated;
grant execute on function public.pedir_assinatura(text,text,text) to authenticated;
