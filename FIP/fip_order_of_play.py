#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrator de Horários e Campos da Order of Play (FIP Tour)
Descarrega os PDFs diários de Order of Play publicados no padelfip.com
e atualiza a coluna `data_hora_campo` na tabela `torneiosfpp_matches`.
"""

import sys
import os
import re
import json
import urllib.request
import unicodedata
from pypdf import PdfReader

# Garante suporte a utf-8 na consola do Windows
if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def normalizar_texto(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-zA-Z0-9]', ' ', s).lower().strip()

def obter_credenciais_supabase():
    env_path = os.path.join(os.path.dirname(__file__), '../.env')
    sb_url = os.environ.get('SUPABASE_URL_SN_LIGA', '')
    sb_key = os.environ.get('SUPABASE_KEY_SN_LIGA', '')

    if os.path.exists(env_path) and (not sb_url or not sb_key):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('SUPABASE_URL_SN_LIGA='):
                    sb_url = line.split('=', 1)[1].strip()
                elif line.startswith('SUPABASE_KEY_SN_LIGA='):
                    sb_key = line.split('=', 1)[1].strip()
    return sb_url, sb_key

def obter_pdf_urls_da_pagina(event_slug, torneio_nome=''):
    url = f"https://www.padelfip.com/events/{event_slug}/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = ''
    try:
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        # Fallback: se o slug direto falhar, procura o link exato no calendário do ano
        if torneio_nome:
            try:
                ano_match = re.search(r'20\d{2}', event_slug)
                ano_str = ano_match.group(0) if ano_match else '2026'
                cal_url = f"https://www.padelfip.com/calendar-cupra-fip-tour/?events-year={ano_str}"
                cal_req = urllib.request.Request(cal_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(cal_req) as c_resp:
                    cal_html = c_resp.read().decode('utf-8', errors='ignore')

                # Procura links de eventos que contenham palavras do nome do torneio
                palavras = [w for w in normalizar_texto(torneio_nome).split() if len(w) >= 4 and w not in ['fipp', 'fip', 'tour', 'open']]
                links = re.findall(r'href="(https://www\.padelfip\.com/events/[^"/]+/)', cal_html)
                for l in links:
                    l_norm = normalizar_texto(l)
                    if any(p in l_norm for p in palavras):
                        print(f"   ↳ URL resolvido via calendário: {l}")
                        fallback_req = urllib.request.Request(l, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(fallback_req) as f_resp:
                            html = f_resp.read().decode('utf-8', errors='ignore')
                        break
            except Exception as fe:
                pass

        if not html:
            print(f"⚠️ Erro ao aceder a {url}: {e}")
            return []

    # Extrai links de PDFs de Order of Play
    pdf_matches = re.findall(r'href="([^"]*ORDER-OF-PLAY-[^"]*\.pdf)"', html, re.IGNORECASE)
    seen = set()
    pdf_urls = []
    for u in pdf_matches:
        if u not in seen:
            seen.add(u)
            pdf_urls.append(u)
    return pdf_urls

def parse_data_do_nome_pdf(pdf_url):
    m = re.search(r'(\d{1,2})[-_]([A-Za-z]+)[-_](\d{4})', pdf_url, re.IGNORECASE)
    meses = {
        'jan': '01', 'feb': '02', 'fev': '02', 'mar': '03', 'apr': '04', 'abr': '04',
        'may': '05', 'mai': '05', 'jun': '06', 'jul': '07', 'aug': '08', 'ago': '08',
        'sep': '09', 'set': '09', 'oct': '10', 'out': '10', 'nov': '11', 'dec': '12', 'dez': '12'
    }
    if m:
        dia = m.group(1).zfill(2)
        mes_key = m.group(2)[:3].lower()
        mes = meses.get(mes_key, '09')
        return f"{dia}/{mes}"
    return "Hoje"

def extrair_slots_de_pdf(pdf_bytes, data_str):
    import io
    reader = PdfReader(io.BytesIO(pdf_bytes))
    full_text = '\n'.join([p.extract_text() for p in reader.pages])

    slots = []

    # 1. Layout de Qualificação (Qualifying Q1 / Q2 por colunas de campos)
    q_matches = re.split(r'(Qualifying\s+Q[12])', full_text)
    if len(q_matches) >= 5:
        # Detectar courts e horas do cabeçalho
        courts_header = re.findall(r'COURT\s+(\d+)', full_text[:600], re.IGNORECASE)
        courts_list = [f"Campo {c}" for c in courts_header] if courts_header else ["Campo 5", "Campo 6", "Campo 7", "Campo 8"]

        court_idx = 0
        for i in range(1, len(q_matches), 2):
            q_label = q_matches[i].strip()
            block = q_matches[i+1].strip()

            c_name = courts_list[court_idx % len(courts_list)]
            if 'Q1' in q_label:
                hora = '10:00'
            else:
                hora = '16:00'
                court_idx += 1

            lines = [l.strip() for l in block.split('\n') if l.strip() and not l.strip().startswith('ANY MATCH') and not l.strip().startswith('Tournament')]
            if len(lines) >= 2:
                slots.append({
                    'court': c_name,
                    'time': hora,
                    'date': data_str,
                    'raw_text': ' '.join(lines),
                    'norm_text': normalizar_texto(' '.join(lines))
                })
        return slots

    # 2. Layout padrão de Quadro Principal (COURT 1, COURT 2...)
    court_chunks = re.split(r'(COURT\s+\d+)', full_text, flags=re.IGNORECASE)
    current_court = ''

    for chunk in court_chunks:
        m_court = re.match(r'COURT\s+(\d+)', chunk.strip(), re.IGNORECASE)
        if m_court:
            current_court = f"Campo {m_court.group(1)}"
            continue
        if not current_court:
            continue

        parts = re.split(r'((?:Starting at|Not before|Followed by)\s*(?:\d+:\d+\s*(?:AM|PM))?)', chunk, flags=re.IGNORECASE)
        current_time = 'A definir'
        for s in parts:
            s_clean = s.strip()
            if not s_clean:
                continue

            m_start = re.search(r'Starting at\s*(\d+):(\d+)\s*(AM|PM)', s_clean, re.IGNORECASE)
            m_nb = re.search(r'Not before\s*(\d+):(\d+)\s*(AM|PM)', s_clean, re.IGNORECASE)

            if m_start:
                h, m, p = int(m_start.group(1)), m_start.group(2), m_start.group(3).upper()
                if p == 'PM' and h < 12: h += 12
                if p == 'AM' and h == 12: h = 0
                current_time = f"{h:02d}:{m}"
                continue
            elif m_nb:
                h, m, p = int(m_nb.group(1)), m_nb.group(2), m_nb.group(3).upper()
                if p == 'PM' and h < 12: h += 12
                if p == 'AM' and h == 12: h = 0
                current_time = f"{h:02d}:{m}"
                continue
            elif re.search(r'Followed by', s_clean, re.IGNORECASE):
                current_time = "A seguir"
                continue

            lines = [l.strip() for l in s_clean.split('\n') if l.strip() and not l.strip().startswith('ANY MATCH') and not l.strip().startswith('Tournament')]
            if len(lines) >= 2:
                slots.append({
                    'court': current_court,
                    'time': current_time,
                    'date': data_str,
                    'raw_text': ' '.join(lines),
                    'norm_text': normalizar_texto(' '.join(lines))
                })

    return slots

def atualizar_horarios_torneio(torneio_fpp_id, event_slug, torneio_nome=''):
    sb_url, sb_key = obter_credenciais_supabase()
    if not sb_url or not sb_key:
        print("❌ Credenciais do Supabase não encontradas!")
        return 0

    print(f"\n========================================================")
    print(f"🕒 A extrair Horários / Order of Play para [{torneio_fpp_id}]...")
    print(f"========================================================")

    # 1. Obter jogos existentes na base de dados
    req = urllib.request.Request(f"{sb_url}/rest/v1/torneiosfpp_matches?torneio_id=eq.{torneio_fpp_id}&select=id,categoria,fase,ronda,equipa_a,equipa_b,data_hora_campo")
    req.add_header('apikey', sb_key)
    req.add_header('Authorization', f'Bearer {sb_key}')
    with urllib.request.urlopen(req) as resp:
        db_matches = json.loads(resp.read().decode('utf-8'))

    print(f"📌 Total de jogos na BD: {len(db_matches)}")

    # 2. Obter URLs dos PDFs de Order of Play
    pdf_urls = obter_pdf_urls_da_pagina(event_slug, torneio_nome)
    print(f"📄 Encontrados {len(pdf_urls)} PDFs de Order of Play na página oficial.")

    all_slots = []
    for pdf_url in pdf_urls:
        data_str = parse_data_do_nome_pdf(pdf_url)
        print(f"   ↳ A ler {pdf_url.split('/')[-1]} ({data_str})...")
        try:
            req_pdf = urllib.request.Request(pdf_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req_pdf) as r:
                pdf_bytes = r.read()
            slots = extrair_slots_de_pdf(pdf_bytes, data_str)
            print(f"     ✓ {len(slots)} slots de jogos extraídos.")
            all_slots.extend(slots)
        except Exception as e:
            print(f"     ⚠️ Erro ao descarregar PDF: {e}")

    # 3. Fazer correspondência e atualizar na BD
    atualizados = 0
    matched_ids = set()

    for slot in all_slots:
        for m in db_matches:
            if m['id'] in matched_ids:
                continue

            p1 = normalizar_texto(m['equipa_a'])
            p2 = normalizar_texto(m['equipa_b'])

            words1 = [w for w in p1.split() if len(w) >= 4 and w != 'qualificado']
            words2 = [w for w in p2.split() if len(w) >= 4 and w != 'qualificado']

            score1 = sum(1 for w in words1 if w in slot['norm_text'])
            score2 = sum(1 for w in words2 if w in slot['norm_text'])

            is_match = False
            if score1 >= 1 and score2 >= 1:
                is_match = True
            elif (score1 >= 2 or score2 >= 2) and 'qualifier' in slot['norm_text']:
                is_match = True

            if is_match:
                matched_ids.add(m['id'])
                atualizados += 1

                # Monta a string no formato standard do projeto: "DD/MM HH:MM - Campo X" ou "DD/MM (A seguir) - Campo X"
                if slot['time'] == 'A seguir':
                    data_hora_campo = f"{slot['date']} (A seguir) - {slot['court']}"
                else:
                    data_hora_campo = f"{slot['date']} {slot['time']} - {slot['court']}"

                # Patch no Supabase
                patch_data = json.dumps({'data_hora_campo': data_hora_campo}).encode('utf-8')
                p_req = urllib.request.Request(
                    f"{sb_url}/rest/v1/torneiosfpp_matches?id=eq.{m['id']}",
                    data=patch_data,
                    headers={
                        'apikey': sb_key,
                        'Authorization': f'Bearer {sb_key}',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    method='PATCH'
                )
                try:
                    with urllib.request.urlopen(p_req) as pr:
                        pass
                    print(f"   ✓ [{data_hora_campo}] {m['equipa_a']} vs {m['equipa_b']}")
                except Exception as pe:
                    print(f"   ⚠️ Erro ao atualizar match {m['id']}: {pe}")
                break

    print(f"\n🎉 Concluído: {atualizados} jogos atualizados com data, hora e campo com sucesso!")
    return atualizados

if __name__ == '__main__':
    t_id = sys.argv[1] if len(sys.argv) > 1 else '2026-09-25-fip-silver-s-o-jo-o-da-madeira-fpp'
    slug = sys.argv[2] if len(sys.argv) > 2 else 'fip-silver-sao-joao-da-madeira-2026'
    nome = sys.argv[3] if len(sys.argv) > 3 else ''
    atualizar_horarios_torneio(t_id, slug, nome)
