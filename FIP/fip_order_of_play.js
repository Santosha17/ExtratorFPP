#!/usr/bin/env node
/**
 * Extrator e Sincronizador de Horários e Campos da Order of Play (FIP Tour)
 * Descarrega os PDFs diários de Order of Play publicados no padelfip.com
 * e atualiza a coluna `data_hora_campo` na tabela `torneiosfpp_matches`.
 * 
 * Implementado nativamente em Node.js com suporte a ordenação por grelha (row-major).
 */

require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const https = require('https');
const http = require('http');
const pdfParse = require('pdf-parse-new');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA || process.env.SUPABASE_KEY;

function normalizarTexto(s) {
    if (!s) return '';
    return s.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function obterPdfUrlsDaPagina(eventSlug, torneioNome = '') {
    const url = `https://www.padelfip.com/events/${eventSlug}/`;
    let html = '';
    try {
        const buf = await fetchUrl(url);
        html = buf.toString('utf-8');
    } catch (e) {
        // Fallback: se o slug falhar, pesquisa no calendário
        if (torneioNome) {
            try {
                const anoMatch = eventSlug.match(/20\d{2}/);
                const anoStr = anoMatch ? anoMatch[0] : '2026';
                const calUrl = `https://www.padelfip.com/calendar-cupra-fip-tour/?events-year=${anoStr}`;
                const calBuf = await fetchUrl(calUrl);
                const calHtml = calBuf.toString('utf-8');

                const palavras = normalizarTexto(torneioNome).split(' ').filter(w => w.length >= 4 && !['fipp', 'fip', 'tour', 'open'].includes(w));
                const links = calHtml.match(/href="(https:\/\/www\.padelfip\.com\/events\/[^"/]+\/)"/g) || [];
                for (const l of links) {
                    const cleanLink = l.replace('href="', '').replace('"', '');
                    const lNorm = normalizarTexto(cleanLink);
                    if (palavras.some(p => lNorm.includes(p))) {
                        console.log(`   ↳ URL resolvido via calendário: ${cleanLink}`);
                        const fbBuf = await fetchUrl(cleanLink);
                        html = fbBuf.toString('utf-8');
                        break;
                    }
                }
            } catch (fe) {}
        }
        if (!html) {
            console.warn(`⚠️ Não foi possível obter página do evento ${url}`);
            return [];
        }
    }

    const pdfMatches = html.match(/href="([^"]*ORDER-OF-PLAY-[^"]*\.pdf)"/gi) || [];
    const seen = new Set();
    const pdfUrls = [];
    for (const m of pdfMatches) {
        const u = m.replace(/^href="/i, '').replace(/"$/, '');
        if (!seen.has(u)) {
            seen.add(u);
            pdfUrls.push(u);
        }
    }
    return pdfUrls;
}

function parseDataDoNomePdf(pdfUrl) {
    const m = pdfUrl.match(/(\d{1,2})[-_]([A-Za-z]+)[-_](\d{4})/i);
    const meses = {
        'jan': '01', 'feb': '02', 'fev': '02', 'mar': '03', 'apr': '04', 'abr': '04',
        'may': '05', 'mai': '05', 'jun': '06', 'jul': '07', 'aug': '08', 'ago': '08',
        'sep': '09', 'set': '09', 'oct': '10', 'out': '10', 'nov': '11', 'dec': '12', 'dez': '12'
    };
    if (m) {
        const dia = m[1].padStart(2, '0');
        const mesKey = m[2].slice(0, 3).toLowerCase();
        const mes = meses[mesKey] || '10';
        return `${dia}/${mes}`;
    }
    return 'Hoje';
}

function extrairSlotsDeTexto(fullText, dataStr) {
    const slots = [];

    // 1. Layout Tabular / Grelha com Cartões (FIP Promises, FIP Tour padrão)
    const headerGridMatch = fullText.match(/((?:CAMPO|COURT)\s+\d+[\s\S]+?)(?:ANY MATCH|Tournament Director|Released|Main Referee)/i);
    if (headerGridMatch) {
        const gridText = headerGridMatch[1];
        const courtChunks = gridText.split(/(?=(?:CAMPO|COURT)\s+\d+)/i);
        const courtSchedule = [];
        for (const chunk of courtChunks) {
            if (!chunk.trim()) continue;
            const cMatch = chunk.match(/(?:CAMPO|COURT)\s+(\d+)/i);
            if (!cMatch) continue;
            const courtName = `Campo ${cMatch[1]}`;
            const times = [];
            for (const line of chunk.split('\n')) {
                const l = line.trim();
                if (!l || /^(?:CAMPO|COURT)\s+\d+/i.test(l)) continue;
                const mStart = l.match(/(?:Starting at|Not before)\s*(\d+):(\d+)\s*(AM|PM)/i);
                if (mStart) {
                    let h = parseInt(mStart[1], 10);
                    const m = mStart[2];
                    const p = mStart[3].toUpperCase();
                    if (p === 'PM' && h < 12) h += 12;
                    if (p === 'AM' && h === 12) h = 0;
                    times.push(`${String(h).padStart(2, '0')}:${m}`);
                } else if (/Followed by/i.test(l)) {
                    times.push("A seguir");
                }
            }
            if (times.length > 0) {
                courtSchedule.push({ court: courtName, times });
            }
        }

        if (courtSchedule.length > 0) {
            const catRegex = /\n(U\d+[BG]|MD|WD|MQ|WQ)\b/gi;
            const rawMatches = [];
            let lastIdx = 0, catM;
            while ((catM = catRegex.exec(fullText)) !== null) {
                const block = fullText.slice(lastIdx, catM.index).trim();
                const category = catM[1];
                lastIdx = catM.index + catM[0].length;
                if (block.toLowerCase().includes('vs')) {
                    rawMatches.push({ block, category });
                }
            }

            if (rawMatches.length > 0) {
                const numCourts = courtSchedule.length;
                rawMatches.forEach((rm, i) => {
                    const courtIdx = i % numCourts;
                    const row = Math.floor(i / numCourts);
                    const courtObj = courtSchedule[courtIdx];
                    const time = (courtObj && courtObj.times[row]) ? courtObj.times[row] : 'A seguir';
                    slots.push({
                        court: courtObj ? courtObj.court : `Campo ${courtIdx + 1}`,
                        time: time,
                        date: dataStr,
                        raw_text: rm.block,
                        norm_text: normalizarTexto(rm.block)
                    });
                });
                return slots;
            }
        }
    }

    // 2. Layout Linear padrão de Quadros (COURT 1, COURT 2...)
    const courtChunks = fullText.split(/((?:COURT|CAMPO)\s+\d+)/i);
    let currentCourt = '';

    for (const chunk of courtChunks) {
        const mCourt = chunk.trim().match(/^(?:COURT|CAMPO)\s+(\d+)/i);
        if (mCourt) {
            currentCourt = `Campo ${mCourt[1]}`;
            continue;
        }
        if (!currentCourt) continue;

        const parts = chunk.split(/((?:Starting at|Not before|Followed by)\s*(?:\d+:\d+\s*(?:AM|PM))?)/i);
        let currentTime = 'A definir';
        for (const s of parts) {
            const sClean = s.trim();
            if (!sClean) continue;

            const mStart = sClean.match(/Starting at\s*(\d+):(\d+)\s*(AM|PM)/i);
            const mNb = sClean.match(/Not before\s*(\d+):(\d+)\s*(AM|PM)/i);

            if (mStart) {
                let h = parseInt(mStart[1], 10);
                const m = mStart[2];
                const p = mStart[3].toUpperCase();
                if (p === 'PM' && h < 12) h += 12;
                if (p === 'AM' && h === 12) h = 0;
                currentTime = `${String(h).padStart(2, '0')}:${m}`;
                continue;
            } else if (mNb) {
                let h = parseInt(mNb[1], 10);
                const m = mNb[2];
                const p = mNb[3].toUpperCase();
                if (p === 'PM' && h < 12) h += 12;
                if (p === 'AM' && h === 12) h = 0;
                currentTime = `${String(h).padStart(2, '0')}:${m}`;
                continue;
            } else if (/Followed by/i.test(sClean)) {
                currentTime = "A seguir";
                continue;
            }

            if (sClean.toLowerCase().includes('vs')) {
                slots.push({
                    court: currentCourt,
                    time: currentTime,
                    date: dataStr,
                    raw_text: sClean,
                    norm_text: normalizarTexto(sClean)
                });
            }
        }
    }

    return slots;
}

async function atualizarHorariosTorneio(torneioFppId, eventSlug, torneioNome = '') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error("❌ Credenciais do Supabase em falta.");
        return 0;
    }

    console.log(`\n========================================================`);
    console.log(`🕒 A extrair Horários / Order of Play para [${torneioFppId}]...`);
    console.log(`========================================================`);

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
    };

    // 1. Obter jogos do torneio na BD
    let dbMatches = [];
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches?torneio_id=eq.${encodeURIComponent(torneioFppId)}&select=id,categoria,fase,equipa_a,equipa_b,data_hora_campo,resultado`, { headers });
        if (res.ok) {
            dbMatches = await res.json();
        }
    } catch (e) {
        console.error(`❌ Erro ao consultar torneiosfpp_matches:`, e.message);
        return 0;
    }

    console.log(`📌 Total de jogos na BD: ${dbMatches.length}`);

    // 2. Obter PDFs
    const pdfUrls = await obterPdfUrlsDaPagina(eventSlug, torneioNome);
    console.log(`📄 Encontrados ${pdfUrls.length} PDFs de Order of Play na página oficial.`);

    const allSlots = [];
    for (const pdfUrl of pdfUrls) {
        const dataStr = parseDataDoNomePdf(pdfUrl);
        const fileName = pdfUrl.split('/').pop();
        console.log(`   ↳ A ler ${fileName} (${dataStr})...`);
        try {
            const pdfBytes = await fetchUrl(pdfUrl);
            const pdfData = await pdfParse(pdfBytes);
            const slots = extrairSlotsDeTexto(pdfData.text, dataStr);
            console.log(`     ✓ ${slots.length} slots de jogos extraídos.`);
            allSlots.push(...slots);
        } catch (e) {
            console.warn(`     ⚠️ Erro ao descarregar/processar PDF ${fileName}:`, e.message);
        }
    }

    // 3. Fazer correspondência e atualizar
    let atualizados = 0;
    const matchedIds = new Set();

    for (const slot of allSlots) {
        for (const m of dbMatches) {
            if (matchedIds.has(m.id)) continue;
            // Se o jogo já terminou com resultado, não sobrescrever com horário pendente
            if (m.resultado && m.resultado !== 'Pendente') continue;

            const p1 = normalizarTexto(m.equipa_a);
            const p2 = normalizarTexto(m.equipa_b);

            const words1 = p1.split(' ').filter(w => w.length >= 4 && !['qualificado', 'definir', 'bye'].includes(w));
            const words2 = p2.split(' ').filter(w => w.length >= 4 && !['qualificado', 'definir', 'bye'].includes(w));

            const score1 = words1.filter(w => slot.norm_text.includes(w)).length;
            const score2 = words2.filter(w => slot.norm_text.includes(w)).length;

            let isMatch = false;
            if (score1 >= 1 && score2 >= 1) {
                isMatch = true;
            } else if ((score1 >= 2 || score2 >= 2) && slot.norm_text.includes('qualifier')) {
                isMatch = true;
            }

            if (isMatch) {
                matchedIds.add(m.id);
                atualizados++;

                const dataHoraCampo = slot.time === 'A seguir'
                    ? `${slot.date} (A seguir) - ${slot.court}`
                    : `${slot.date} ${slot.time} - ${slot.court}`;

                try {
                    await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches?id=eq.${m.id}`, {
                        method: 'PATCH',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ data_hora_campo: dataHoraCampo })
                    });
                    console.log(`   ✓ [${dataHoraCampo}] ${m.equipa_a} vs ${m.equipa_b}`);
                } catch (pe) {
                    console.warn(`   ⚠️ Erro ao atualizar match ${m.id}:`, pe.message);
                }
                break;
            }
        }
    }

    console.log(`\n🎉 Concluído: ${atualizados} jogos atualizados com data, hora e campo com sucesso!`);
    return atualizados;
}

if (require.main === module) {
    const tId = process.argv[2] || 'fip-2026-p0240';
    const slug = process.argv[3] || 'fip-promises-caldas-2026';
    const nome = process.argv[4] || 'FIP PROMISES CALDAS';
    atualizarHorariosTorneio(tId, slug, nome).catch(console.error);
}

module.exports = {
    atualizarHorariosTorneio,
    extrairSlotsDeTexto,
    parseDataDoNomePdf,
    normalizarTexto
};
