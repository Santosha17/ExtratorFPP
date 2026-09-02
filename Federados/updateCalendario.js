process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = globalThis.fetch || require('node-fetch');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

const headersSupabase = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates, return=minimal'
};

// -----------------------------------------------------------------------------
// 1. DICIONÁRIO DE MESES E ANALISADOR DE DATAS (PT + EN)
// -----------------------------------------------------------------------------
const mesesMap = {
    'jan': 1,
    'fev': 2, 'feb': 2,
    'mar': 3,
    'abr': 4, 'apr': 4,
    'mai': 5, 'may': 5,
    'jun': 6,
    'jul': 7,
    'ago': 8, 'aug': 8,
    'set': 9, 'sep': 9,
    'out': 10, 'oct': 10,
    'nov': 11,
    'dez': 12, 'dec': 12
};

const romanToArabicMap = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
    'xi': '11', 'xii': '12', 'xiii': '13', 'xiv': '14', 'xv': '15',
    'xvi': '16', 'xvii': '17', 'xviii': '18', 'xix': '19', 'xx': '20'
};

function parseDatasFromCorrida(dataCorridaStr, anoInt) {
    if (!dataCorridaStr) return { data_inicio: null, data_fim: null, mesInicio: null, mesFim: null };

    const ano = anoInt || new Date().getFullYear();
    const str = dataCorridaStr.toLowerCase().trim();

    // 1. "26 Feb - 1 Mar" ou "30 Jul - 2 Aug" (meses diferentes)
    const diffMatch = str.match(/^(\d{1,2})\s+([a-z]{3})\s*-\s*(\d{1,2})\s+([a-z]{3})/i);
    if (diffMatch) {
        const d1 = parseInt(diffMatch[1], 10);
        const m1 = mesesMap[diffMatch[2].toLowerCase()];
        const d2 = parseInt(diffMatch[3], 10);
        const m2 = mesesMap[diffMatch[4].toLowerCase()];
        if (m1 && m2) {
            const pad = n => String(n).padStart(2, '0');
            return {
                data_inicio: `${ano}-${pad(m1)}-${pad(d1)}`,
                data_fim: `${ano}-${pad(m2)}-${pad(d2)}`,
                mesInicio: m1,
                mesFim: m2
            };
        }
    }

    // 2. "18 - 22 Mar" ou "1 - 8 Feb" (mesmo mês)
    const sameMatch = str.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-z]{3})/i);
    if (sameMatch) {
        const d1 = parseInt(sameMatch[1], 10);
        const d2 = parseInt(sameMatch[2], 10);
        const m = mesesMap[sameMatch[3].toLowerCase()];
        if (m) {
            const pad = n => String(n).padStart(2, '0');
            return {
                data_inicio: `${ano}-${pad(m)}-${pad(d1)}`,
                data_fim: `${ano}-${pad(m)}-${pad(d2)}`,
                mesInicio: m,
                mesFim: m
            };
        }
    }

    // 3. "20 Mar" (dia único)
    const singleMatch = str.match(/^(\d{1,2})\s+([a-z]{3})/i);
    if (singleMatch) {
        const d = parseInt(singleMatch[1], 10);
        const m = mesesMap[singleMatch[2].toLowerCase()];
        if (m) {
            const pad = n => String(n).padStart(2, '0');
            const dataStr = `${ano}-${pad(m)}-${pad(d)}`;
            return {
                data_inicio: dataStr,
                data_fim: dataStr,
                mesInicio: m,
                mesFim: m
            };
        }
    }

    return { data_inicio: null, data_fim: null, mesInicio: null, mesFim: null };
}

// -----------------------------------------------------------------------------
// 2. NORMALIZADOR DE TEXTO INTELIGENTE (ROMANOS, ORDINAIS E ACENTOS)
// -----------------------------------------------------------------------------
function normalizeTournamentName(name) {
    if (!name) return "";

    let s = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Substituir ordinais (ex: 2º, 2ª, 2o, 2a -> 2)
    s = s.replace(/(\d+)\s*[ºªoa]\b/g, '$1');

    // Substituir números romanos isolados por dígitos (ex: II -> 2, IV -> 4, IX -> 9)
    s = s.replace(/\b([ivx]+)\b/g, (match) => {
        return romanToArabicMap[match] || match;
    });

    // Remover pontuação e caracteres especiais mantendo apenas alfanuméricos e espaços
    s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    return s;
}

// -----------------------------------------------------------------------------
// 3. COMPARADOR DE SIMILARIDADE INTELIGENTE (FUZZY MATCH)
// -----------------------------------------------------------------------------
const genericStopWords = new Set([
    'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'para', 'por', 'by',
    'padel', 'open', 'torneio', 'campeonato', 'fpp', 'fip', 'clube',
    'club', 'circuit', 'circuito', 'cup', 'trofeu', 'trofeus'
]);

function calculateSimilarity(str1, str2) {
    const norm1 = normalizeTournamentName(str1);
    const norm2 = normalizeTournamentName(str2);

    if (!norm1 || !norm2) return 0;
    if (norm1 === norm2) return 1.0;

    // Se uma string contém a outra na íntegra
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
        const shorter = Math.min(norm1.length, norm2.length);
        const longer = Math.max(norm1.length, norm2.length);
        if (shorter / longer >= 0.6) return 0.95;
    }

    const words1 = norm1.split(/\s+/).filter(w => w.length >= 2 && !genericStopWords.has(w));
    const words2 = norm2.split(/\s+/).filter(w => w.length >= 2 && !genericStopWords.has(w));

    if (words1.length === 0 || words2.length === 0) return 0;

    let matches = 0;
    for (const w of words1) {
        if (words2.includes(w)) {
            matches++;
        }
    }

    // Coeficiente de Sobreposição (Overlap)
    const minWords = Math.min(words1.length, words2.length);
    const overlapRatio = matches / minWords;

    // Coeficiente de Jaccard
    const allDistinct = new Set([...words1, ...words2]).size;
    const jaccard = matches / allDistinct;

    return Math.max(overlapRatio * 0.8, jaccard);
}

// -----------------------------------------------------------------------------
// 4. MOTOR PRINCIPAL
// -----------------------------------------------------------------------------
(async () => {
    const ANO_ALVO = '2026';
    console.log("==========================================================");
    console.log(`🚀 A iniciar extração do calendário ${ANO_ALVO} via Puppeteer...`);
    console.log("==========================================================");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Bloquear imagens e recursos pesados
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
            req.abort().catch(() => {});
        } else {
            req.continue().catch(() => {});
        }
    });

    await page.goto("https://tour.tiesports.com/fpp/calendar_(tournaments)", { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log(`   📅 A definir o ano para ${ANO_ALVO}...`);
    try {
        await page.select('select[name="drop_filter_tournaments_year"]', ANO_ALVO);
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log("   ⚠️ Dropdown de ano não disponível ou já selecionado.");
    }

    const torneiosMapeados = [];

    // Loop pelos 12 meses
    for (let mes = 1; mes <= 12; mes++) {
        console.log(`   ⏳ A extrair torneios do mês ${mes}/${ANO_ALVO}...`);

        try {
            const previousHtml = await page.evaluate(() => document.querySelector('table.shop-table tbody')?.innerHTML || '');

            await page.select('select[name="drop_filter_tournaments_month"]', mes.toString());

            const waitResponse = page.waitForResponse(res => res.url().includes('calendar') && res.status() === 200, { timeout: 12000 }).catch(() => null);
            await page.evaluate(() => {
                const btn = document.querySelector('input[name="btn_filter_tournaments"]');
                if (btn) btn.click();
            });
            await waitResponse;

            await page.waitForFunction(
                (prev) => {
                    const current = document.querySelector('table.shop-table tbody')?.innerHTML || '';
                    return current !== prev;
                },
                { timeout: 5000 },
                previousHtml
            ).catch(() => {});

            await new Promise(r => setTimeout(r, 600));

            const extraidosNoMes = await page.evaluate((ano) => {
                const results = [];

                document.querySelectorAll('table.shop-table tbody tr').forEach(tr => {
                    const linkEl = tr.querySelector('a[id*="repeater_tournaments_link_"]');
                    if (!linkEl) return;

                    const nome = linkEl.innerText.trim();
                    if (nome.toLowerCase().includes('liga mudum')) return;

                    const url_tiepadel = linkEl.href;
                    const fpp_id = url_tiepadel.split('/')[4] || linkEl.innerText.trim().replace(/[^a-zA-Z0-9]/g, '');

                    const getText = (selector) => {
                        const el = tr.querySelector(selector);
                        return el ? el.innerText.trim() : '';
                    };

                    results.push({
                        fpp_id: fpp_id,
                        nome: nome,
                        url_tiepadel: url_tiepadel,
                        classe: getText('span[id*="_lbl_section_"]'),
                        categorias: getText('span[id*="_lbl_pages_"]'),
                        data_corrida: getText('span[id*="_lbl_local_date_"]'),
                        clube_nome: getText('span[id*="_lbl_club_"]'),
                        inscritos_masculinos: parseInt(getText('span[id*="_lbl_count_male_"]')) || 0,
                        inscritos_femininos: parseInt(getText('span[id*="_lbl_count_female_"]')) || 0,
                        url_cartaz: tr.querySelector('img[id*="_img_cover_"]')?.src || '',
                        ano: parseInt(ano)
                    });
                });

                return results;
            }, ANO_ALVO);

            let adicionadosMes = 0;
            for (const t of extraidosNoMes) {
                if (!torneiosMapeados.find(x => x.fpp_id === t.fpp_id)) {
                    torneiosMapeados.push(t);
                    adicionadosMes++;
                }
            }

            console.log(`      ✔️ Mês ${mes}: ${adicionadosMes} torneios novos adicionados (Total até agora: ${torneiosMapeados.length}).`);
        } catch (mesErr) {
            console.error(`      ❌ Erro no mês ${mes}:`, mesErr.message);
        }
    }

    await browser.close();
    console.log(`\n🎯 Fim da pesquisa! Total: ${torneiosMapeados.length} torneios únicos encontrados no Tiepadel.`);

    // -----------------------------------------------------------------------------
    // RECONCILIAÇÃO INTELIGENTE COM A TABELA TORNEIOSFPP (SUPABASE)
    // -----------------------------------------------------------------------------
    if (torneiosMapeados.length > 0) {
        console.log("\n📥 A obter torneios registados do Supabase para reconciliação inteligente...");
        let dbTournaments = [];
        try {
            const resDb = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?select=id,fpp_id,nome,data_inicio,data_fim,url_tiepadel`, { headers: headersSupabase });
            if (resDb.ok) dbTournaments = await resDb.json();
        } catch (e) {
            console.error("⚠️ Falha ao obter base de dados. Vai avançar sem reconciliação.");
        }

        console.log(`📊 Base de dados tem ${dbTournaments.length} torneios registados.`);

        const reconciliados = [];
        let reconciliacoesCount = 0;
        let novosStandaloneCount = 0;

        for (const t of torneiosMapeados) {
            // Calcular datas automaticamente a partir da data_corrida (ex: 26 Feb - 1 Mar)
            const parsedDates = parseDatasFromCorrida(t.data_corrida, t.ano);
            t.data_inicio = parsedDates.data_inicio;
            t.data_fim = parsedDates.data_fim;

            let melhorMatch = null;
            let melhorScore = 0;
            let melhorIndex = -1;

            if (dbTournaments.length > 0) {
                for (let i = 0; i < dbTournaments.length; i++) {
                    const dbT = dbTournaments[i];

                    // Extrair mês do registo na BD se existir
                    let dbMes = null;
                    if (dbT.data_inicio) {
                        dbMes = parseInt(dbT.data_inicio.split('-')[1], 10);
                    }

                    // Se temos indicação de mês, validar proximidade temporal (mesmo mês ou mês adjacente)
                    if (dbMes && (parsedDates.mesInicio || parsedDates.mesFim)) {
                        const mesesValidos = [
                            parsedDates.mesInicio,
                            parsedDates.mesFim,
                            parsedDates.mesInicio ? parsedDates.mesInicio - 1 : null,
                            parsedDates.mesFim ? parsedDates.mesFim + 1 : null
                        ].filter(Boolean);

                        if (!mesesValidos.includes(dbMes)) {
                            continue; // Meses totalmente diferentes, salta
                        }
                    }

                    const score = calculateSimilarity(dbT.nome, t.nome);
                    if (score > melhorScore && score >= 0.55) {
                        melhorScore = score;
                        melhorMatch = dbT;
                        melhorIndex = i;
                    }
                }
            }

            if (melhorMatch && melhorScore >= 0.55) {
                // Casamento efetuado com sucesso!
                t.fpp_id = melhorMatch.fpp_id; // Atualiza o registo original do PDF
                t.nome = melhorMatch.nome;     // Preserva o nome oficial do PDF
                if (melhorMatch.data_inicio) t.data_inicio = melhorMatch.data_inicio;
                if (melhorMatch.data_fim) t.data_fim = melhorMatch.data_fim;

                reconciliacoesCount++;
                dbTournaments.splice(melhorIndex, 1); // Remove da pool para casamento 1-para-1
            } else {
                novosStandaloneCount++;
            }

            t.updated_at = new Date().toISOString();

            if (!reconciliados.find(r => r.fpp_id === t.fpp_id)) {
                reconciliados.push(t);
            }
        }

        console.log(`\n==========================================================`);
        console.log(`🔗 Casamentos Efetuados: ${reconciliacoesCount} torneios ligados com sucesso ao plano do PDF!`);
        console.log(`➕ Torneios Autónomos (Criados direto no Tiepadel): ${novosStandaloneCount}`);
        console.log(`💾 A sincronizar ${reconciliados.length} registos no Supabase em lotes...`);
        console.log(`==========================================================`);

        // Enviar em blocos de 50 para evitar limites de payload
        const CHUNK_SIZE = 50;
        let totalSalvos = 0;

        for (let i = 0; i < reconciliados.length; i += CHUNK_SIZE) {
            const chunk = reconciliados.slice(i, i + CHUNK_SIZE);
            const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`, {
                method: 'POST',
                headers: headersSupabase,
                body: JSON.stringify(chunk)
            });

            if (resInsert.ok) {
                totalSalvos += chunk.length;
            } else {
                console.error(`❌ Erro no lote ${i / CHUNK_SIZE + 1}:`, await resInsert.text());
            }
        }

        console.log(`\n🏆 Sincronização concluída! ${totalSalvos} torneios guardados no Supabase com sucesso.`);
    } else {
        console.log("⚠️ Nenhum torneio para gravar.");
    }
})();