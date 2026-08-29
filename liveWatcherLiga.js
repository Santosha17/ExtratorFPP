process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();
const puppeteer = require('puppeteer');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

// 🚀 CONFIGURAÇÃO DAS ZONAS REGIONAIS
const TORNEIOS_LIGA = [
    { nome: "Zona 1A,1B,1C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud1ABC/Draws" },
    { nome: "Zona 2", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud2/Draws" },
    { nome: "Zona 3A,3B,3C,3D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud3ABCD/Draws" },
    { nome: "Zona 4A,4B,4C,4D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud4ABCD/Draws" },
    { nome: "Zona 5", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud5/Draws" },
    { nome: "Zona 6A,6B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud6AB/Draws" },
    { nome: "Zona 7A,7B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud7AB/Draws" },
    { nome: "Zona 8A,8B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/RegMud8AB/Draws" }
];

// 🚀 LER OS ARGUMENTOS DO TERMINAL
const args = process.argv.slice(2);
const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const getArgsList = (name) => {
    const matches = args.filter(a => a.startsWith(`--${name}=`)).map(a => a.split('=').slice(1).join('='));
    if (matches.length === 0) return [];
    return matches.flatMap(m => m.split('|').map(s => s.trim()));
};

const IS_LIVE_MODE = hasFlag('live');
const INTERVAL_SECONDS = parseInt(getArg('interval') || '60', 10);
const MAX_CONCURRENCY = parseInt(getArg('concurrency') || '6', 10);
const CHECK_ALL_DATES = hasFlag('todos');

// Se não passar --data, usa a data de hoje no fuso horário de Portugal (YYYY-MM-DD)
const DATA_ALVO = getArg('data') || (CHECK_ALL_DATES ? null : new Date().toLocaleDateString('sv-SE'));

const ZONAS_FILTRO = [...getArgsList('zona'), ...getArgsList('zonas'), ...getArgsList('fase')];
const FILTER_TIPO = getArg('tipo');
const FILTER_CATEGORIA = getArg('categoria');
const FILTER_GRUPO = getArg('grupo');

function matchZona(nomeTorneio, inputList) {
    if (!inputList || inputList.length === 0) return true;
    const clean = s => s.toLowerCase().replace(/^zona\s*/i, '').replace(/\s+/g, '');
    const cleanNome = clean(nomeTorneio);
    return inputList.some(inp => {
        const cleanInp = clean(inp);
        return cleanNome === cleanInp || cleanNome.includes(cleanInp) || cleanInp.includes(cleanNome);
    });
}

let torneiosAlvo = TORNEIOS_LIGA;
if (FILTER_TIPO) torneiosAlvo = torneiosAlvo.filter(t => t.tipo.toLowerCase() === FILTER_TIPO.toLowerCase());
if (ZONAS_FILTRO.length > 0) torneiosAlvo = torneiosAlvo.filter(t => matchZona(t.nome, ZONAS_FILTRO));

if (torneiosAlvo.length === 0) {
    console.log("⚠️ Nenhum torneio encontrado com os filtros fornecidos. A abortar.");
    process.exit(0);
}

// -----------------------------------------------------------------------------
// CACHE EM MEMÓRIA (FINGERPRINTING PARA EVITAR CLIQUES REDUNDANTES)
// -----------------------------------------------------------------------------
const stateCache = new Map();

function generateCacheKey(meta) {
    return `${meta.zona}|${meta.categoria}|${meta.grupo}|${meta.home_team}|${meta.away_team}|${meta.data_jogo || 'no-date'}`;
}

function areRubbersIdentical(cachedRubbers = [], newRubbers = []) {
    if (cachedRubbers.length !== newRubbers.length) return false;
    for (let i = 0; i < cachedRubbers.length; i++) {
        const r1 = cachedRubbers[i];
        const r2 = newRubbers[i];
        if (r1.rubber_number !== r2.rubber_number ||
            r1.home_duo !== r2.home_duo ||
            r1.away_duo !== r2.away_duo ||
            r1.result !== r2.result ||
            r1.campo !== r2.campo) {
            return false;
        }
    }
    return true;
}

// -----------------------------------------------------------------------------
// REDE & SUPABASE
// -----------------------------------------------------------------------------
async function fetchWithRetry(url, options = {}, retries = 8) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res) return res;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(1.5, i)));
        }
    }
}

async function guardarNoSupabaseEmTempoReal(meta, jogosExtraidos, prefix) {
    if (!meta.home_team || !meta.away_team || 
        meta.home_team.trim() === "" || meta.away_team.trim() === "" ||
        meta.home_team === "Equipa Casa" || meta.away_team === "Equipa Fora" ||
        meta.home_team === "Unknown" || meta.away_team === "Unknown") {
        return { updated: false, ignored: true };
    }

    let matchStatus = 'scheduled';
    if (meta.home_score !== null && meta.away_score !== null) matchStatus = 'completed';

    try {
        let matchId;

        const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(meta.home_team)}&away_team=eq.${encodeURIComponent(meta.away_team)}&zona=eq.${encodeURIComponent(meta.zona)}&categoria=eq.${encodeURIComponent(meta.categoria)}&fase=eq.${encodeURIComponent(meta.fase || "Fase Regional")}&select=id,home_score,away_score,status`;

        const resMatch = await fetchWithRetry(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const matchesDb = await resMatch.json();

        const dbDate = meta.data_jogo ? meta.data_jogo.replace(' ', 'T') + '+00:00' : null;

        const payloadMatch = {
            epoca: "2026",
            fase: meta.fase || "Fase Regional",
            zona: meta.zona,
            tipo: meta.tipo,
            categoria: meta.categoria,
            grupo: meta.grupo,
            home_team: meta.home_team,
            away_team: meta.away_team,
            data_jogo: dbDate,
            status: matchStatus,
            home_score: meta.home_score,
            away_score: meta.away_score
        };
        if (meta.campo) payloadMatch.campo = meta.campo;

        if (!matchesDb || matchesDb.length === 0) {
            const resCreateMatch = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(payloadMatch)
            });
            if (resCreateMatch.ok) {
                const newMatch = await resCreateMatch.json();
                if (newMatch && newMatch.length > 0) matchId = newMatch[0].id;
            }
        } else {
            matchId = matchesDb[0].id;
            await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadMatch)
            });
        }

        if (!matchId || !jogosExtraidos || jogosExtraidos.length === 0) {
            return { updated: true, matchId };
        }

        // Atualizar Rubbers / Duplas
        for (const r of jogosExtraidos) {
            if (!r.rubber_number) continue;

            const payloadDetail = {
                match_id: matchId,
                rubber_number: r.rubber_number,
                home_duo: r.home_duo,
                away_duo: r.away_duo,
                result: r.result
            };
            if (r.campo) payloadDetail.campo = r.campo;

            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${r.rubber_number}&select=id,result,home_duo,away_duo`;
            const resDetailCheck = await fetchWithRetry(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const existingDetails = await resDetailCheck.json();

            if (existingDetails && existingDetails.length > 0) {
                const detailId = existingDetails[0].id;
                await fetchWithRetry(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ home_duo: r.home_duo, away_duo: r.away_duo, result: r.result, ...(r.campo ? { campo: r.campo } : {}) })
                });
            } else {
                await fetchWithRetry(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadDetail)
                });
            }
        }

        return { updated: true, matchId };
    } catch (error) {
        console.error(`${prefix} ❌ Erro no Supabase:`, error.message);
        return { updated: false, error };
    }
}

async function atualizarHeartbeat() {
    try {
        const payload = {
            id: 'sync_fpp_live_watcher',
            last_run: new Date().toISOString(),
            status: 'success'
        };

        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/sync_heartbeats`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });
    } catch (e) {}
}

// -----------------------------------------------------------------------------
// NAVEGAÇÃO E EXTRAÇÃO ULTRA-RÁPIDA REATIVA
// -----------------------------------------------------------------------------
const safeEvaluate = async (pageToEval, evaluateFn, ...evalArgs) => {
    for (let i = 0; i < 3; i++) {
        try {
            return await pageToEval.evaluate(evaluateFn, ...evalArgs);
        } catch (e) {
            if (e.message.includes("Execution context was destroyed") || e.message.includes("Target closed")) {
                await new Promise(r => setTimeout(r, 1000));
            } else {
                throw e;
            }
        }
    }
};

async function processarTorneioLive(torneio, browser, prefix) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        try {
            await page.goto(torneio.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
        } catch (e) {
            console.log(`${prefix}   ⚠️ Zona não disponível ou página lenta. A saltar...`);
            return;
        }

        const categorias = await safeEvaluate(page, () => {
            const select = document.querySelector('#drop_tournaments');
            if (!select) return [];
            return Array.from(select.options)
                .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
        });

        for (const cat of categorias) {
            if (FILTER_CATEGORIA && !cat.nome.toLowerCase().includes(FILTER_CATEGORIA.toLowerCase())) {
                continue;
            }

            try {
                await page.goto(torneio.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 8000 });
                await page.select('#drop_tournaments', cat.valor);

                // Espera rápida pelo botão ENCONTROS
                await page.waitForFunction(() => {
                    const links = Array.from(document.querySelectorAll('a, span, div'));
                    return links.some(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                }, { timeout: 4000 }).catch(() => {});

                const clicouEncontros = await safeEvaluate(page, () => {
                    const links = Array.from(document.querySelectorAll('a, span, div'));
                    const encontrosLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                    if (encontrosLink) { encontrosLink.click(); return true; }
                    return false;
                });

                if (!clicouEncontros) continue;

                // Espera rápida pela tabela de jogos
                await page.waitForSelector('table.rgMasterTable, table[id*="grid"], table tr td', { timeout: 4000 }).catch(() => {});

                const grupos = await safeEvaluate(page, () => {
                    const links = Array.from(document.querySelectorAll('a'));
                    return links.map(l => l.innerText.trim()).filter(text => 
                        text.includes("Grupo") || 
                        text.includes("Série") || text.includes("Serie") || 
                        text.includes("Poule") || text.includes("-QP") ||
                        text.includes("-QLL") || text.includes("Eliminatória") ||
                        text.includes("Final")
                    );
                });

                const listaDeGrupos = grupos.length > 0 ? grupos : ["Fase Única"];

                for (const grupo of listaDeGrupos) {
                    if (FILTER_GRUPO && !grupo.toLowerCase().includes(FILTER_GRUPO.toLowerCase())) {
                        continue;
                    }

                    if (grupo !== "Fase Única" && grupo !== "Fase Regular" && grupo !== "Main") {
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
                            safeEvaluate(page, (nomeGrupo) => {
                                const links = Array.from(document.querySelectorAll('a'));
                                const target = links.find(l => l.innerText.trim() === nomeGrupo);
                                if (target) target.click();
                            }, grupo)
                        ]);
                        await new Promise(r => setTimeout(r, 600));
                    }

                    // Extrair lista de jogos da tabela
                    const metadadosJogos = await safeEvaluate(page, (nomeGrupoPadrao) => {
                        const arr = [];
                        let subGrupoAtual = nomeGrupoPadrao;

                        const ths = Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
                        let campoColIdx = ths.findIndex(h => h.toUpperCase() === 'CAMPO' || h.toUpperCase() === 'LOCAL');

                        document.querySelectorAll('table tr').forEach((tr) => {
                            if (tr.classList.contains('rgGroupHeader')) {
                                const headerText = tr.innerText.trim();
                                if (headerText) subGrupoAtual = headerText;
                                return;
                            }

                            const tds = Array.from(tr.querySelectorAll('td'));
                            if (tds.length < 3) return;

                            let home = "", away = "", dataJogo = null;
                            let matchScoreHome = null, matchScoreAway = null;
                            let campo = null;

                            const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                            if (dashIdx > 0 && dashIdx + 1 < tds.length) {
                                home = tds[dashIdx - 1].innerText.replace(/✔/g, '').trim();
                                away = tds[dashIdx + 1].innerText.replace(/✔/g, '').trim();
                            }

                            if (campoColIdx !== -1 && tds[campoColIdx]) {
                                const campoTxt = tds[campoColIdx].innerText.trim();
                                if (campoTxt && campoTxt !== '-' && !campoTxt.includes('\n')) {
                                    campo = campoTxt;
                                }
                            }

                            if (!campo && dashIdx > 0) {
                                for (let k = dashIdx + 2; k < tds.length; k++) {
                                    const txt = tds[k].innerText.trim();
                                    if (txt && txt !== '-' && !txt.includes('\n') && !txt.toUpperCase().includes('ALTERAR') && !/^\d+\s*-\s*\d+$/.test(txt)) {
                                        campo = txt;
                                        break;
                                    }
                                }
                            }

                            const scoreTd = tds.find(td => /\b[0-3]\s*-\s*[0-3]\b/.test(td.innerText));
                            if (scoreTd) {
                                const parts = scoreTd.innerText.match(/\b([0-3])\s*-\s*([0-3])\b/);
                                if (parts) {
                                    matchScoreHome = parseInt(parts[1]);
                                    matchScoreAway = parseInt(parts[2]);
                                }
                            }

                            const dateRegex = /((\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4}))(?:[\s\S]*?(\d{2}:\d{2}))?/;
                            for (let td of tds) {
                                const match = td.innerText.match(dateRegex);
                                if (match) {
                                    let rawDate = match[1].replace(/\//g, '-');
                                    const timePart = match[4] ? `${match[4]}:00` : `00:00:00`;
                                    if (/^\d{2}-/.test(rawDate)) {
                                        const parts = rawDate.split('-');
                                        rawDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                    }
                                    dataJogo = `${rawDate} ${timePart}`;
                                    break;
                                }
                            }

                            if (home && home !== "Equipa Casa" && home !== "Unknown") {
                                const btnRubbers = tr.querySelector('a[id*="link_open_rubbers"]');
                                arr.push({
                                    home,
                                    away,
                                    dataJogo,
                                    matchScoreHome,
                                    matchScoreAway,
                                    campo,
                                    temBotao: !!btnRubbers,
                                    btnId: btnRubbers ? btnRubbers.id : null,
                                    subGrupo: subGrupoAtual
                                });
                            }
                        });
                        return arr;
                    }, grupo);

                    for (const meta of metadadosJogos) {
                        // FILTRO POR DATA: Se tiver data configurada, só monitoriza jogos dessa data
                        if (DATA_ALVO && meta.dataJogo && !meta.dataJogo.startsWith(DATA_ALVO)) {
                            continue;
                        }

                        const metaParaBD = {
                            zona: torneio.nome,
                            tipo: torneio.tipo,
                            categoria: cat.nome,
                            grupo: meta.subGrupo || grupo,
                            home_team: meta.home,
                            away_team: meta.away,
                            data_jogo: meta.dataJogo,
                            home_score: meta.matchScoreHome,
                            away_score: meta.matchScoreAway,
                            campo: meta.campo,
                            fase: "Fase Regional"
                        };

                        const cacheKey = generateCacheKey(metaParaBD);
                        const cached = stateCache.get(cacheKey);

                        // OTIMIZAÇÃO: Se o jogo já terminou completamente (3 duplas fechadas) e nada mudou no placar geral, ignora!
                        if (cached && cached.isFinal && cached.home_score === meta.matchScoreHome && cached.away_score === meta.matchScoreAway) {
                            continue;
                        }

                        // Se não tem botão de duplas, apenas atualiza metadata se o placar mudou
                        if (!meta.temBotao || !meta.btnId) {
                            if (!cached || cached.home_score !== meta.matchScoreHome || cached.away_score !== meta.matchScoreAway) {
                                await guardarNoSupabaseEmTempoReal(metaParaBD, [], prefix);
                                stateCache.set(cacheKey, { home_score: meta.matchScoreHome, away_score: meta.matchScoreAway, rubbers: [], isFinal: false });
                            }
                            continue;
                        }

                        // CLICAR E EXTRAIR DUPLAS / RUBBERS
                        try {
                            await safeEvaluate(page, () => {
                                const grid = document.querySelector('table[id*="grid_matches_rubbers"] tbody') || document.querySelector('table[id*="grid_rubbers"] tbody');
                                if (grid) grid.innerHTML = '';
                            });

                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => {}),
                                safeEvaluate(page, (btnId) => {
                                    const btn = document.getElementById(btnId);
                                    if (btn) btn.click();
                                }, meta.btnId)
                            ]);

                            // Espera reativa rápida pelo aparecimento das duplas
                            await page.waitForSelector('table[id*="grid_matches_rubbers"] tbody tr, table[id*="grid_rubbers"] tbody tr', { timeout: 3000 }).catch(() => {});

                            const jogosExtraidos = await safeEvaluate(page, () => {
                                const details = [];
                                const cleanText = (t) => t ? t.replace(/\s+/g, ' ').replace(/✔/g, '').trim() : '';

                                const selector = 'table[id*="grid_matches_rubbers"] tbody tr, table[id*="grid_rubbers"] tbody tr';
                                document.querySelectorAll(selector).forEach((tr) => {
                                    const tds = Array.from(tr.querySelectorAll('td'));
                                    if (tds.length >= 3) {
                                        let rubberNum = null;
                                        const numMatch = tds[0].innerText.match(/\d+/);
                                        if (numMatch) rubberNum = parseInt(numMatch[0]);

                                        let rubberCampo = null;
                                        if (tds.length >= 5) {
                                            const possibleCampo = cleanText(tds[4].innerText);
                                            if (possibleCampo && !/\d+\s*-\s*\d+/.test(possibleCampo) && !possibleCampo.includes('/')) {
                                                rubberCampo = possibleCampo;
                                            }
                                        }

                                        let homeRaw = tds[1]?.innerText || '';
                                        let awayRaw = tds[2]?.innerText || '';
                                        let scoreRaw = tds[3]?.innerText || '';

                                        let homeDuo = cleanText(homeRaw);
                                        let awayDuo = cleanText(awayRaw);
                                        let score = cleanText(scoreRaw);

                                        if (homeDuo || awayDuo || score) {
                                            details.push({
                                                rubber_number: rubberNum,
                                                home_duo: homeDuo || 'A Definir',
                                                away_duo: awayDuo || 'A Definir',
                                                result: score,
                                                campo: rubberCampo
                                            });
                                        }
                                    }
                                });
                                return details;
                            });

                            // Verifica se houve alteração face à cache
                            const rubbersMudaram = !cached || !areRubbersIdentical(cached.rubbers, jogosExtraidos);
                            const placarMudou = !cached || cached.home_score !== meta.matchScoreHome || cached.away_score !== meta.matchScoreAway;

                            if (rubbersMudaram || placarMudou) {
                                await guardarNoSupabaseEmTempoReal(metaParaBD, jogosExtraidos, prefix);

                                const duplasResumo = jogosExtraidos.map(r => `D${r.rubber_number}: ${r.result || 'a decorrer'}`).join(' | ');
                                console.log(`${prefix} ⚡ [AO VIVO] ${meta.home} (${meta.matchScoreHome ?? '-'}) vs (${meta.matchScoreAway ?? '-'}) ${meta.away} -> [${duplasResumo || 'Duplas registadas'}]`);

                                const isFinal = (meta.matchScoreHome !== null && meta.matchScoreAway !== null) && 
                                                jogosExtraidos.length >= 3 && 
                                                jogosExtraidos.every(r => r.result && r.result.trim() !== '');

                                stateCache.set(cacheKey, {
                                    home_score: meta.matchScoreHome,
                                    away_score: meta.matchScoreAway,
                                    rubbers: jogosExtraidos,
                                    isFinal
                                });
                            }

                        } catch (matchErr) {
                            // Continua em caso de erro transitório
                        } finally {
                            // Voltar para a tabela principal rapidamente
                            try {
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {}),
                                    safeEvaluate(page, () => {
                                        const btn = document.getElementById('link_back_matches_list') || 
                                                    Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                        if (btn) btn.click();
                                    })
                                ]);
                                await new Promise(r => setTimeout(r, 400));
                            } catch (e) {}
                        }
                    }
                }
            } catch (catError) {}
        }
    } finally {
        try { await page.close(); } catch (e) {}
    }
}

// -----------------------------------------------------------------------------
// CICLO SENTINELA
// -----------------------------------------------------------------------------
async function executarCicloSentinela(cicloNum) {
    const inicio = Date.now();
    const horaAtual = new Date().toLocaleTimeString('pt-PT');
    console.log(`\n======================================================`);
    console.log(`📡 [LIVE WATCHER #${cicloNum}] A varrer Liga Regional (${horaAtual})`);
    console.log(`🎯 Filtro Data: ${DATA_ALVO ? DATA_ALVO : 'Todas as datas'} | Concorrência: ${MAX_CONCURRENCY} Browsers`);
    console.log(`======================================================`);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], 
        defaultViewport: null 
    });

    try {
        const fila = [...torneiosAlvo];
        const emExecucao = [];

        for (const torneio of fila) {
            const prefix = `[${torneio.nome}]`;
            const p = processarTorneioLive(torneio, browser, prefix).then(() => {
                emExecucao.splice(emExecucao.indexOf(p), 1);
            });

            emExecucao.push(p);

            if (emExecucao.length >= MAX_CONCURRENCY) {
                await Promise.race(emExecucao);
            }
        }

        await Promise.all(emExecucao);
        await atualizarHeartbeat();

        const duracaoSegundos = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`⏱️ Ciclo #${cicloNum} concluído em ${duracaoSegundos}s. (Próxima ronda em ${INTERVAL_SECONDS}s)`);
    } finally {
        try { await browser.close(); } catch (e) {}
    }
}

(async () => {
    console.log("🚀 A iniciar o Live Match Watcher da Liga FPPadel...");
    let ciclo = 1;

    if (IS_LIVE_MODE) {
        console.log(`🔁 MODO SENTINELA ATIVO (Intervalo: ${INTERVAL_SECONDS}s). Pressione Ctrl+C para parar.\n`);
        while (true) {
            try {
                await executarCicloSentinela(ciclo++);
            } catch (err) {
                console.error("⚠️ Erro no ciclo sentinela:", err.message);
            }
            await new Promise(r => setTimeout(r, INTERVAL_SECONDS * 1000));
        }
    } else {
        await executarCicloSentinela(1);
        console.log("\n🏆 Verificação ao vivo concluída!");
        process.exit(0);
    }
})();
