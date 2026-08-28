process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();
const puppeteer = require('puppeteer');
const url = require("node:url");

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

// 🚀 NÚMERO MÁXIMO DE BROWSERS EM SIMULTÂNEO
const MAX_CONCURRENCY = 6;

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
    return arg ? arg.split('=')[1] : null;
};

const FILTER_ZONA = getArg('zona');
const FILTER_TIPO = getArg('tipo');
const FILTER_CATEGORIA = getArg('categoria');
const FILTER_GRUPO = getArg('grupo');

// Filtra logo a lista base antes de abrir o browser
let torneiosAlvo = TORNEIOS_LIGA;
if (FILTER_TIPO) torneiosAlvo = torneiosAlvo.filter(t => t.tipo === FILTER_TIPO);
if (FILTER_ZONA) torneiosAlvo = torneiosAlvo.filter(t => t.nome === FILTER_ZONA);

if (torneiosAlvo.length === 0) {
    console.log("⚠️ Nenhum torneio encontrado com os filtros fornecidos. A abortar.");
    process.exit(0);
}

// -----------------------------------------------------------------------------
// 1. GERADOR DA FILA DE TAREFAS
// -----------------------------------------------------------------------------
function gerarFilaDeTarefas() {
    const tasks = [];
    let idCounter = 1;
    const FASE_NOME = "Fase Regional";

    const zonasNormais = ["Zona 1A,1B,1C", "Zona 3A,3B,3C,3D", "Zona 4A,4B,4C,4D", "Zona 6A,6B", "Zona 7A,7B", "Zona 8A,8B"];
    for (const z of zonasNormais) {
        tasks.push({ id: idCounter++, nomeJob: "JOB1_ABS_NORMAIS", fase: FASE_NOME, zona: z, tipo: "Absolutos", categoria: null, grupo: null });
    }

    const zonasPesadas = ["Zona 2", "Zona 5"];
    const catLigeiras = ["Femininos", "Masculinos 1", "Masculinos 2", "Masculinos 3"];
    for (const z of zonasPesadas) {
        for (const c of catLigeiras) {
            tasks.push({ id: idCounter++, nomeJob: "JOB3_ABS_LIGEIRAS", fase: FASE_NOME, zona: z, tipo: "Absolutos", categoria: c, grupo: null });
        }
    }

    const catPesadas = ["Masculinos 4", "Masculinos 5", "Masculinos 6"];
    const grupos = ["Grupo A", "Grupo B", "Grupo C", "Grupo D", "Grupo E", "Grupo F", "Grupo G", "Grupo H", "Grupo I"];
    for (const z of zonasPesadas) {
        for (const c of catPesadas) {
            for (const g of grupos) {
                tasks.push({ id: idCounter++, nomeJob: "JOB4_ABS_GRUPOS", fase: FASE_NOME, zona: z, tipo: "Absolutos", categoria: c, grupo: g });
            }
        }
    }

    return tasks;
}

// -----------------------------------------------------------------------------
// 2. FUNÇÃO DO SUPABASE E REDE
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
        console.warn(`${prefix} ⚠️ [VALIDAÇÃO] Jogo ignorado (dados de equipa incompletos): "${meta.home_team}" vs "${meta.away_team}"`);
        return;
    }

    let matchStatus = 'scheduled';
    if (meta.home_score !== null && meta.away_score !== null) matchStatus = 'completed';

    try {
        let matchId;

        let urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(meta.home_team)}&away_team=eq.${encodeURIComponent(meta.away_team)}&zona=eq.${encodeURIComponent(meta.zona)}&categoria=eq.${encodeURIComponent(meta.categoria)}&fase=eq.${encodeURIComponent(meta.fase || "Fase Regional")}&select=id`;

        const resMatch = await fetchWithRetry(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const matchesDb = await resMatch.json();

        const dbDate = meta.data_jogo ? meta.data_jogo.replace(' ', 'T') + '+00:00' : null;

        const payloadMatch = {
            epoca: "2026", fase: meta.fase || "Fase Regional", zona: meta.zona, tipo: meta.tipo,
            categoria: meta.categoria, grupo: meta.grupo, home_team: meta.home_team,
            away_team: meta.away_team, data_jogo: dbDate, status: matchStatus,
            home_score: meta.home_score, away_score: meta.away_score
        };
        if (meta.campo) payloadMatch.campo = meta.campo;

        let dbSuccess = false;

        if (!matchesDb || matchesDb.length === 0) {
            const resCreateMatch = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(payloadMatch) });
            if (resCreateMatch.ok) {
                dbSuccess = true;
                const newMatch = await resCreateMatch.json();
                if (newMatch && newMatch.length > 0) matchId = newMatch[0].id;
            } else {
                console.error(`${prefix} 🚨 ERRO a INSERIR jogo na BD:`, await resCreateMatch.text());
            }
        } else {
            matchId = matchesDb[0].id;
            const resUpdateMatch = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payloadMatch) });
            if (resUpdateMatch.ok) {
                dbSuccess = true;
            } else {
                console.error(`${prefix} 🚨 ERRO a ATUALIZAR jogo na BD:`, await resUpdateMatch.text());
            }
        }

        if (dbSuccess) {
            console.log(`${prefix}       [SUPABASE] ✅ Jogo guardado/atualizado!`);
        }

        if (!matchId || !jogosExtraidos || jogosExtraidos.length === 0) return;

        for (const r of jogosExtraidos) {
            if (!r.rubber_number) continue;

            const payloadDetail = { match_id: matchId, rubber_number: r.rubber_number, home_duo: r.home_duo, away_duo: r.away_duo, result: r.result };
            if (r.campo) payloadDetail.campo = r.campo;

            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${r.rubber_number}&select=id`;
            const resDetailCheck = await fetchWithRetry(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const existingDetails = await resDetailCheck.json();

            if (existingDetails && existingDetails.length > 0) {
                const detailId = existingDetails[0].id;
                await fetchWithRetry(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ home_duo: r.home_duo, away_duo: r.away_duo, result: r.result })
                });
            } else {
                await fetchWithRetry(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadDetail)
                });
            }
        }
    } catch (error) {
        console.error(`${prefix} ❌ Erro a atualizar dados no Supabase:`, error);
    }
}

// -----------------------------------------------------------------------------
// 🚀 NOVA FUNÇÃO: ATUALIZAR HEARTBEAT NO SUPABASE
// -----------------------------------------------------------------------------
async function atualizarHeartbeat() {
    try {
        const agora = new Date().toISOString();
        const url = `${SUPABASE_URL}/rest/v1/scraper_status?id=eq.1`;
        const res = await fetchWithRetry(url, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ultima_execucao: agora })
        });

        if (res.ok) {
            console.log(`\n[SISTEMA] ✅ Heartbeat atualizado com sucesso! (${new Date().toLocaleString('pt-PT')})`);
        } else {
            console.error(`\n[SISTEMA] ⚠️ Falha ao atualizar Heartbeat. Status: ${res.status}`);
        }
    } catch (error) {
        console.error("\n[SISTEMA] ❌ Erro ao enviar Heartbeat:", error);
    }
}

// -----------------------------------------------------------------------------
// 3. MÁQUINA DE RASPAGEM
// -----------------------------------------------------------------------------
async function executarTarefaPuppeteer(task) {
    const prefix = `[SUB-MÁQUINA ${task.id} | ${task.nomeJob}]`;
    console.log(`${prefix} A arrancar: Zona=${task.zona} | Cat=${task.categoria || 'Todas'} | Grupo=${task.grupo || 'Todos'}`);

    // 🔥 O AUTO-RETRY: Função que espera pacientemente se o site for lento! 🔥
    const safeEvaluate = async (pageToEval, evaluateFn, ...args) => {
        let lastError;
        for (let i = 0; i < 4; i++) {
            try {
                return await pageToEval.evaluate(evaluateFn, ...args);
            } catch (e) {
                lastError = e;
                if (e.message.includes("Execution context was destroyed") || e.message.includes("Target closed")) {
                    await new Promise(r => setTimeout(r, 3500));
                } else {
                    throw e; // Se for outro erro qualquer, atira logo
                }
            }
        }
        throw lastError; // Se falhou 4 vezes seguidas, desiste e atira erro
    };

    const torneiosAlvo = TORNEIOS_LIGA.filter(t => t.nome === task.zona && t.tipo === task.tipo);

    if (torneiosAlvo.length === 0) {
        console.log(`${prefix} ⚠️ Torneio não encontrado. Abortando tarefa.`);
        return;
    }

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: null });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        for (const torneio of torneiosAlvo) {
            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
            } catch (e) {
                console.log(`${prefix}   ⚠️ O site não carregou ou esta Zona ainda não foi publicada. A saltar...`);
                continue;
            }

            const categorias = await safeEvaluate(page, () => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options).filter(opt => opt.value !== "0" && opt.innerText.trim() !== "").map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                if (task.categoria && !cat.nome.includes(task.categoria)) {
                    continue;
                }

                console.log(`\n${prefix} 🎾 A processar: ${torneio.tipo} > ${cat.nome}`);
                try {
                    await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                    await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
                    await page.select('#drop_tournaments', cat.valor);
                    await new Promise(r => setTimeout(r, 4000));

                    const clicouEncontros = await safeEvaluate(page, () => {
                        const links = Array.from(document.querySelectorAll('a, span, div'));
                        const encontrosLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                        if (encontrosLink) { encontrosLink.click(); return true; }
                        return false;
                    });

                    if (!clicouEncontros) continue;
                    await new Promise(r => setTimeout(r, 4000));

                    const grupos = await safeEvaluate(page, () => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(l => l.innerText.trim()).filter(text => 
                            text.includes("Grupo") || text === "Main" || 
                            text.includes("Série") || text.includes("Serie") || 
                            text.includes("Poule") || text.includes("-QP") ||
                            text.includes("-QLL") || text.includes("Eliminatória") ||
                            text.includes("Final")
                        );
                    });

                    const listaDeGrupos = grupos.length > 0 ? grupos : ["Main"];

                    for (const grupo of listaDeGrupos) {
                        try {
                            if (task.grupo && !grupo.includes(task.grupo)) {
                                continue;
                            }

                            console.log(`${prefix}    🔎 A procurar jogos em: ${grupo}...`);
                            if (grupo !== "Fase Única" && grupo !== "Fase Regular" && grupo !== "Main") {
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                                    safeEvaluate(page, (nomeGrupo) => {
                                        const links = Array.from(document.querySelectorAll('a'));
                                        const target = links.find(l => l.innerText.trim() === nomeGrupo);
                                        if (target) target.click();
                                    }, grupo)
                                ]);
                                await new Promise(r => setTimeout(r, 3000));
                            }

                            const metadadosJogos = await safeEvaluate(page, (nomeGrupoPadrao) => {
                                const arr = [];
                                let subGrupoAtual = nomeGrupoPadrao;

                                const ths = Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
                                let campoColIdx = ths.findIndex(h => h.toUpperCase() === 'CAMPO');
                                if (campoColIdx === -1) campoColIdx = ths.findIndex(h => h.toUpperCase() === 'LOCAL');

                                document.querySelectorAll('table tr').forEach((tr, trIndex) => {
                                    if (tr.classList.contains('rgGroupHeader')) {
                                        const headerText = tr.innerText.trim();
                                        if (headerText) {
                                            subGrupoAtual = headerText;
                                        }
                                        return;
                                    }

                                    const tds = Array.from(tr.querySelectorAll('td'));
                                    let home = "Equipa Casa", away = "Equipa Fora", dataJogo = null;
                                    let matchScoreHome = null, matchScoreAway = null;
                                    let campo = null;

                                    const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                                    if (dashIdx > 0) {
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

                                    if(home !== "Equipa Casa" && home !== "") {
                                        const btnRubbers = tr.querySelector('a[id*="link_open_rubbers"]');
                                        let temBotao = !!btnRubbers;
                                        let btnIdxToClick = temBotao ? trIndex : -1;
                                        arr.push({ home, away, dataJogo, matchScoreHome, matchScoreAway, campo, temBotao, btnIdxToClick, subGrupo: subGrupoAtual });
                                    }
                                });
                                return arr;
                            }, grupo);

                            for (let i = 0; i < metadadosJogos.length; i++) {
                                const meta = metadadosJogos[i];

                                try {
                                    const metaParaBD = {
                                        zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo: meta.subGrupo || grupo,
                                        home_team: meta.home, away_team: meta.away, data_jogo: meta.dataJogo,
                                        home_score: meta.matchScoreHome, away_score: meta.matchScoreAway, campo: meta.campo, fase: task.fase || "Fase Regional"
                                    };

                                    const agora = new Date();
                                    const dataDoJogo = meta.dataJogo ? new Date(meta.dataJogo.replace(' ', 'T')) : null;
                                    const isFuturo = dataDoJogo && dataDoJogo > agora;

                                    if (!meta.temBotao || isFuturo) {
                                        console.log(`${prefix}       ⏳ ${meta.home} vs ${meta.away}: Agendado para ${meta.dataJogo}.`);
                                        await guardarNoSupabaseEmTempoReal(metaParaBD, [], prefix);
                                        continue;
                                    }

                                    console.log(`${prefix}       -> A processar: ${meta.home} vs ${meta.away}...`);

                                    await safeEvaluate(page, () => {
                                        const grid = document.querySelector('table[id*="grid_rubbers"] tbody');
                                        if (grid) grid.innerHTML = '';
                                    });

                                    await Promise.all([
                                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                                        safeEvaluate(page, (idx) => {
                                            const btns = document.querySelectorAll('table tr')[idx]?.querySelectorAll('a[id*="link_open_rubbers"]');
                                            if (btns && btns.length > 0) btns[0].click();
                                        }, meta.btnIdxToClick)
                                    ]);

                                    await new Promise(r => setTimeout(r, 4500));

                                    const jogosExtraidos = await safeEvaluate(page, () => {
                                        const details = [];

                                        const cleanText = (text) => {
                                            if (!text) return "";
                                            return text
                                                .replace(/✔/g, '')
                                                .replace(/\n/g, ' / ')
                                                .replace(/\s+/g, ' ')
                                                .replace(/\s*\/\s*\/\s*/g, ' / ')
                                                .replace(/^[\s/]+|[\s/]+$/g, '')
                                                .trim();
                                        };

                                        const isDate = (t) => /\d{2,4}[-/]\d{2}[-/]\d{2,4}/.test(t);
                                        const isGarbage = (t) => t === '-' || t === '✔' || t === '';
                                        const isCampo = (t) => {
                                            const s = t.toLowerCase().trim();
                                            return s === 'tba' || /^(campo|court|pista|corte)\s*\d+/.test(s);
                                        };
                                        const isScore = (t) => {
                                            const s = t.toLowerCase().trim();
                                            if (/^(w\.o\.|w\.o|fc|desistência|desistencia|ret\.|ret)$/.test(s)) return true;
                                            return /^[\d\s\-\/\(\)\[\],]+$/.test(s) && /\d/.test(s);
                                        };

                                        const thsRubbers = Array.from(document.querySelectorAll('table th')).map(th => th.innerText.trim());
                                        const campoColIdxRubbers = thsRubbers.findIndex(h => h.toUpperCase() === 'CAMPO' || h.toUpperCase() === 'LOCAL');

                                        document.querySelectorAll('table tr').forEach(row => {
                                            const cells = Array.from(row.querySelectorAll('td, th'));
                                            const rowTexts = cells.map(cell => cell.innerText.trim());

                                            const rIndex = rowTexts.findIndex(txt => /^R[1-3]$/.test(txt));

                                            if (rIndex !== -1) {
                                                const rubberNum = parseInt(rowTexts[rIndex].replace('R', ''));

                                                let rubberCampo = null;
                                                if (campoColIdxRubbers !== -1 && cells[campoColIdxRubbers]) {
                                                    const txt = cells[campoColIdxRubbers].innerText.trim();
                                                    if (txt && txt !== '-') rubberCampo = txt;
                                                }

                                                let afterR = rowTexts.slice(rIndex + 1);
                                                let cleaned = afterR.filter(t => !isDate(t) && !isGarbage(t) && !isCampo(t));

                                                let homeRaw = '';
                                                let awayRaw = '';
                                                let scoreRaw = '';

                                                let scoreIdx = -1;
                                                for (let j = cleaned.length - 1; j >= 0; j--) {
                                                    if (isScore(cleaned[j])) {
                                                        scoreIdx = j;
                                                        break;
                                                    }
                                                }

                                                if (scoreIdx !== -1) {
                                                    scoreRaw = cleaned[scoreIdx];
                                                    cleaned.splice(scoreIdx, 1);
                                                }

                                                if (cleaned.length >= 2) {
                                                    homeRaw = cleaned[0];
                                                    awayRaw = cleaned[1];
                                                } else if (cleaned.length === 1) {
                                                    homeRaw = cleaned[0];
                                                }

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

                                    await guardarNoSupabaseEmTempoReal(metaParaBD, jogosExtraidos, prefix);

                                } catch (matchError) {
                                    console.log(`${prefix}       ❌ Falha crítica (Abortar Jogo): ${matchError.message}`);
                                } finally {
                                    try {
                                        await Promise.all([
                                            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
                                            safeEvaluate(page, () => {
                                                const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                                if (btn) btn.click();
                                            })
                                        ]);
                                        await new Promise(r => setTimeout(r, 4500));
                                        
                                        if (grupo !== "Fase Única" && grupo !== "Fase Regular") {
                                            await Promise.all([
                                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
                                                safeEvaluate(page, (nomeGrupo) => {
                                                    const links = Array.from(document.querySelectorAll('a'));
                                                    const target = links.find(l => l.innerText.trim() === nomeGrupo);
                                                    if (target) target.click();
                                                }, grupo)
                                            ]);
                                            await new Promise(r => setTimeout(r, 2500));
                                        }
                                    } catch(e) {}
                                }
                            }
                        } catch (groupError) {
                            console.log(`${prefix}    ❌ Falha num grupo (Avançando para o próximo): ${groupError.message}`);
                        }
                    }
                } catch (catError) {}
            }
        }
    } catch (err) {} finally {
        try { await browser.close(); } catch (e) {}
        console.log(`${prefix} ✅ TAREFA CONCLUÍDA!`);
    }
}

// -----------------------------------------------------------------------------
// 4. MOTOR PRINCIPAL
// -----------------------------------------------------------------------------
(async () => {
    console.log("🚀 A iniciar a 'Aranha' PadelNetwork com Sub-Máquinas...");

    let filaDeTarefas = gerarFilaDeTarefas();

    // 🔥 APLICAR OS FILTROS DO TERMINAL ÀS TAREFAS 🔥
    if (FILTER_ZONA) filaDeTarefas = filaDeTarefas.filter(t => t.zona === FILTER_ZONA);
    if (FILTER_TIPO) filaDeTarefas = filaDeTarefas.filter(t => t.tipo === FILTER_TIPO);

    // Forçar a categoria e grupo na tarefa se o utilizador pedir pelo terminal
    filaDeTarefas = filaDeTarefas.map(t => {
        if (FILTER_CATEGORIA) t.categoria = FILTER_CATEGORIA;
        if (FILTER_GRUPO) t.grupo = FILTER_GRUPO;
        return t;
    });

    // Limpar tarefas repetidas para evitar clonagens em tarefas genéricas
    filaDeTarefas = [...new Map(filaDeTarefas.map(item => [item.zona + item.categoria + item.grupo, item])).values()];

    console.log(`📋 Total de Tarefas a executar: ${filaDeTarefas.length}`);
    console.log(`⚙️ A arrancar com ${MAX_CONCURRENCY} browsers em simultâneo.\n`);

    const emExecucao = [];

    for (const task of filaDeTarefas) {
        const p = executarTarefaPuppeteer(task).then(() => {
            emExecucao.splice(emExecucao.indexOf(p), 1);
        });

        emExecucao.push(p);

        if (emExecucao.length >= MAX_CONCURRENCY) {
            await Promise.race(emExecucao);
        }
    }

    await Promise.all(emExecucao);

    await atualizarHeartbeat();

    console.log("\n🏆 TODO O SCRAPE FOI CONCLUÍDO COM SUCESSO!");
    await new Promise(r => setTimeout(r, 1000));
    process.exit(0);
})();