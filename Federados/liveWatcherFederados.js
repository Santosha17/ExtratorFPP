process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Credenciais do Supabase não encontradas no ficheiro .env!");
    process.exit(1);
}

// 🚀 LER OS ARGUMENTOS DO TERMINAL
const args = process.argv.slice(2);
const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const IS_LIVE_MODE = hasFlag('live');
const INTERVAL_SECONDS = parseInt(getArg('interval') || '60', 10);
const MAX_CONCURRENCY = parseInt(getArg('concurrency') || '4', 10);
const CHECK_ALL = hasFlag('todos');
const FILTER_ID = getArg('id');
const FILTER_CATEGORIA = getArg('categoria');
const FILTER_DATA = getArg('data');
const APENAS_RECENTES = hasFlag('recentes') || hasFlag('ativos');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// CACHE EM MEMÓRIA (FINGERPRINTING PARA DETETAR MUDANÇAS DE RESULTADO EM TEMPO REAL)
// -----------------------------------------------------------------------------
const stateCache = new Map();

function generateCacheKey(m) {
    return `${m.torneio_id}|${m.categoria}|${m.fase}|${m.ronda}|${m.equipa_a}|${m.equipa_b}`;
}

function generateCacheValue(m) {
    return `${m.resultado}|${m.data_hora_campo || ''}`;
}

// -----------------------------------------------------------------------------
// MOTOR DE REDE & SUPABASE (REST COM RETRY)
// -----------------------------------------------------------------------------
async function fetchWithRetry(url, options = {}, retries = 5, initialDelay = 1000) {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res) return res;
        } catch (err) {
            if (i === retries - 1) throw err;
            await delay(currentDelay);
            currentDelay *= 1.5;
        }
    }
}

async function atualizarHeartbeat() {
    try {
        const payload = {
            id: 'sync_fpp_live_federados',
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

async function sincronizarJogoEmTempoReal(match, prefix = "") {
    const key = generateCacheKey(match);
    const val = generateCacheValue(match);

    if (stateCache.has(key) && stateCache.get(key) === val) {
        return { alterado: false };
    }

    const valorAnterior = stateCache.get(key);
    stateCache.set(key, val);

    try {
        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        };

        // 1. Procurar se o jogo já existe na BD
        const queryUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp_matches?torneio_id=eq.${encodeURIComponent(match.torneio_id)}&categoria=eq.${encodeURIComponent(match.categoria)}&fase=eq.${encodeURIComponent(match.fase)}&equipa_a=eq.${encodeURIComponent(match.equipa_a)}&equipa_b=eq.${encodeURIComponent(match.equipa_b)}&select=id,resultado,data_hora_campo`;

        const resCheck = await fetchWithRetry(queryUrl, { headers });
        let matchesDb = [];
        if (resCheck && resCheck.ok) {
            matchesDb = await resCheck.json();
        }

        if (matchesDb && matchesDb.length > 0) {
            const dbMatch = matchesDb[0];
            if (dbMatch.resultado !== match.resultado || dbMatch.data_hora_campo !== match.data_hora_campo) {
                const patchUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp_matches?id=eq.${dbMatch.id}`;
                await fetchWithRetry(patchUrl, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        resultado: match.resultado,
                        data_hora_campo: match.data_hora_campo,
                        ronda: match.ronda
                    })
                });

                console.log(`${prefix} 🔥 [RESULTADO ATUALIZADO] ${match.categoria} (${match.ronda}): ${match.equipa_a} vs ${match.equipa_b} ➜ "${match.resultado}"`);
                return { alterado: true, tipo: 'atualizado' };
            }
        } else {
            // Jogo novo (ex: nova ronda ou quadro gerado a meio do torneio)
            await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify(match)
            });

            console.log(`${prefix} ➕ [NOVO JOGO DETETADO] ${match.categoria} (${match.ronda}): ${match.equipa_a} vs ${match.equipa_b} [${match.resultado}]`);
            return { alterado: true, tipo: 'novo' };
        }
    } catch (e) {
        console.error(`${prefix} ❌ Erro ao sincronizar jogo no Supabase:`, e.message);
    }

    return { alterado: false };
}

// -----------------------------------------------------------------------------
// AVALIADOR SEGURO NO BROWSER (SAFE EVALUATE)
// -----------------------------------------------------------------------------
const safeEvaluate = async (pageToEval, evaluateFn, ...evalArgs) => {
    for (let i = 0; i < 3; i++) {
        try {
            return await pageToEval.evaluate(evaluateFn, ...evalArgs);
        } catch (e) {
            if (e.message.includes("Execution context was destroyed") || e.message.includes("Target closed") || e.message.includes("Navigating frame was detached")) {
                await delay(800);
            } else {
                throw e;
            }
        }
    }
};

// -----------------------------------------------------------------------------
// PROCESSAMENTO LIVE DE UM TORNEIO
// -----------------------------------------------------------------------------
async function processarTorneioLive(torneio, browser, prefix) {
    let page = null;
    let updatesCount = 0;

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Bloqueio de recursos para máxima performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort().catch(() => {});
            } else {
                req.continue().catch(() => {});
            }
        });

        let urlDraws = torneio.url_tiepadel.trim();
        if (urlDraws.endsWith('/')) urlDraws = urlDraws.slice(0, -1);
        if (!urlDraws.toLowerCase().endsWith('/draws')) urlDraws += '/Draws';

        try {
            await page.goto(urlDraws, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForSelector('select[id$="drop_tournaments"], #drop_tournaments', { visible: true, timeout: 6000 });
        } catch (e) {
            return { status: 'sem_quadros' };
        }

        const categorias = await safeEvaluate(page, () => {
            const select = document.querySelector('select[id$="drop_tournaments"], #drop_tournaments');
            if (!select) return [];
            return Array.from(select.options)
                .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                .map(opt => ({ value: opt.value, sigla: opt.innerText.trim() }));
        });

        if (!categorias || categorias.length === 0) return { status: 'sem_quadros' };

        let categoriasAlvo = categorias;
        if (FILTER_CATEGORIA) {
            categoriasAlvo = categoriasAlvo.filter(c => c.sigla.toLowerCase().includes(FILTER_CATEGORIA.toLowerCase()));
        }

        for (const cat of categoriasAlvo) {
            try {
                const dropdownExiste = await page.$('select[id$="drop_tournaments"], #drop_tournaments');
                if (!dropdownExiste) {
                    await page.goto(urlDraws, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
                    await page.waitForSelector('select[id$="drop_tournaments"], #drop_tournaments', { visible: true, timeout: 5000 }).catch(() => {});
                }

                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
                    page.select('select[id$="drop_tournaments"], #drop_tournaments', cat.value)
                ]);
                await delay(400);

                const fases = await safeEvaluate(page, () => {
                    const links = document.querySelectorAll('a[id*="repeater_pages"], a[id*="repeater_groups"], ul.nav-tabs a, .draw-tabs a');
                    if (links.length === 0) return [{ id: null, nome: 'Principal' }];
                    return Array.from(links)
                        .filter(l => l.innerText.trim() !== "")
                        .map(l => ({ id: l.id, nome: l.innerText.trim() }));
                });

                const listaFases = (fases && fases.length > 0) ? fases : [{ id: null, nome: 'Principal' }];

                for (const fase of listaFases) {
                    if (fase.id) {
                        try {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => {}),
                                safeEvaluate(page, (targetId) => {
                                    const el = document.getElementById(targetId);
                                    if (el) el.click();
                                }, fase.id)
                            ]);
                            await delay(300);
                        } catch (navErr) {}
                    }

                    const jogosExtraidos = await safeEvaluate(page, (siglaCat, nomeFase, torneioId) => {
                        const jogos = [];
                        const jogosRaw = [];

                        // Extrair scores e duplas
                        document.querySelectorAll('span[id*="_lbl_score_"]').forEach(scoreEl => {
                            const idParts = scoreEl.id.split('_lbl_score_');
                            if (idParts.length === 2) {
                                const pfx = idParts[0], matchId = idParts[1];
                                const p1a = document.getElementById(`${pfx}_lbl_ply_${matchId}_a_1`)?.innerText.trim();
                                const p2a = document.getElementById(`${pfx}_lbl_ply_${matchId}_a_2`)?.innerText.trim();
                                const p1b = document.getElementById(`${pfx}_lbl_ply_${matchId}_b_1`)?.innerText.trim();
                                const p2b = document.getElementById(`${pfx}_lbl_ply_${matchId}_b_2`)?.innerText.trim();

                                const equipaA = [p1a, p2a].filter(Boolean).join(' / ');
                                const equipaB = [p1b, p2b].filter(Boolean).join(' / ');

                                if (equipaA && equipaB && !equipaA.toLowerCase().includes('bye') && !equipaB.toLowerCase().includes('bye')) {
                                    let dataHoraCampo = '';
                                    const parentTd = scoreEl.closest('td');

                                    if (parentTd) {
                                        let dateSpan = parentTd.querySelector('.date, .time, [id*="lbl_date"]');
                                        if (!dateSpan && parentTd.previousElementSibling) {
                                            dateSpan = parentTd.previousElementSibling.querySelector('.date, .time, [id*="lbl_date"]');
                                        }
                                        if (!dateSpan && parentTd.parentElement) {
                                            dateSpan = parentTd.parentElement.querySelector('.date, .time, [id*="lbl_date"]');
                                        }
                                        if (dateSpan) dataHoraCampo = dateSpan.innerText.trim();

                                        const rect = parentTd.getBoundingClientRect();
                                        jogosRaw.push({
                                            torneio_id: torneioId,
                                            categoria: siglaCat,
                                            fase: nomeFase,
                                            equipa_a: equipaA,
                                            equipa_b: equipaB,
                                            resultado: scoreEl.innerText.trim() || 'Pendente',
                                            data_hora_campo: dataHoraCampo,
                                            x: rect.left,
                                            isTableDraw: !!parentTd.closest('table.new_draw')
                                        });
                                    }
                                }
                            }
                        });

                        const drawMatches = jogosRaw.filter(j => j.isTableDraw);
                        const otherMatches = jogosRaw.filter(j => !j.isTableDraw);

                        if (drawMatches.length > 0) {
                            const xCoords = [];
                            drawMatches.forEach(j => {
                                if (!xCoords.some(x => Math.abs(x - j.x) < 50)) {
                                    xCoords.push(j.x);
                                }
                            });
                            xCoords.sort((a, b) => a - b);

                            const totalRondas = xCoords.length;
                            const roundNamesEndToStart = ["Final", "Meias-Finais", "Quartos-de-final", "Oitavos-de-final", "1/16", "1/32", "1/64"];

                            drawMatches.forEach(j => {
                                const colIndex = xCoords.findIndex(x => Math.abs(x - j.x) < 50);
                                const fromEnd = totalRondas - colIndex - 1;

                                let ronda = "Fase " + (colIndex + 1);
                                if (fromEnd >= 0 && fromEnd < roundNamesEndToStart.length) {
                                    ronda = roundNamesEndToStart[fromEnd];
                                }
                                j.ronda = ronda;
                                jogos.push(j);
                            });
                        }

                        otherMatches.forEach(j => {
                            j.ronda = 'Fase de Grupos';
                            jogos.push(j);
                        });

                        return jogos.map(j => ({
                            torneio_id: j.torneio_id,
                            categoria: j.categoria,
                            fase: j.fase,
                            ronda: j.ronda,
                            equipa_a: j.equipa_a,
                            equipa_b: j.equipa_b,
                            resultado: j.resultado,
                            data_hora_campo: j.data_hora_campo
                        }));
                    }, cat.sigla, fase.nome, torneio.fpp_id);

                    for (const m of jogosExtraidos) {
                        const syncRes = await sincronizarJogoEmTempoReal(m, prefix);
                        if (syncRes.alterado) updatesCount++;
                    }
                }
            } catch (catErr) {}
        }

        return { status: 'sucesso', updates: updatesCount };

    } catch (err) {
        return { status: 'erro', error: err.message };
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

// -----------------------------------------------------------------------------
// CICLO SENTINELA (WATCHER)
// -----------------------------------------------------------------------------
async function executarCicloSentinela(cicloNum, torneios) {
    const inicio = Date.now();
    const horaAtual = new Date().toLocaleTimeString('pt-PT');

    console.log(`\n======================================================`);
    console.log(`📡 [LIVE FEDERADOS #${cicloNum}] A verificar torneios ativos (${horaAtual})`);
    console.log(`🎯 Torneios a monitorizar: ${torneios.length} | Concorrência: ${MAX_CONCURRENCY} Browsers`);
    console.log(`======================================================`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    try {
        const emExecucao = [];
        let totalUpdatesCiclo = 0;

        for (let i = 0; i < torneios.length; i++) {
            const torneio = torneios[i];
            const prefix = `[${torneio.nome}]`;

            const p = processarTorneioLive(torneio, browser, prefix).then((res) => {
                if (res && res.updates) totalUpdatesCiclo += res.updates;
                emExecucao.splice(emExecucao.indexOf(p), 1);
            });

            emExecucao.push(p);

            if (emExecucao.length >= MAX_CONCURRENCY) {
                await Promise.race(emExecucao);
            }
        }

        await Promise.all(emExecucao);
        await atualizarHeartbeat();

        const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`⏱️ Ciclo #${cicloNum} concluído em ${duracao}s (${totalUpdatesCiclo} alterações detetadas). Próxima ronda em ${INTERVAL_SECONDS}s.`);

    } finally {
        await browser.close().catch(() => {});
    }
}

// -----------------------------------------------------------------------------
// ARRANQUE PRINCIPAL
// -----------------------------------------------------------------------------
(async () => {
    console.log("==========================================================");
    console.log("🚀 A iniciar o Live Match Watcher de Torneios Federados...");
    console.log("==========================================================");

    // 1. Obter lista de torneios
    let urlQuery = `${SUPABASE_URL}/rest/v1/torneiosfpp?url_tiepadel=not.is.null&select=fpp_id,nome,url_tiepadel,data_inicio,data_fim,data_corrida,ano`;

    if (FILTER_ID) {
        urlQuery += `&fpp_id=eq.${encodeURIComponent(FILTER_ID)}`;
    }

    urlQuery += `&order=updated_at.desc`;

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
    };

    let torneios = [];
    try {
        const res = await fetchWithRetry(urlQuery, { headers });
        if (res && res.ok) {
            torneios = await res.json();
        } else {
            console.error("❌ Falha ao contactar Supabase:", res ? await res.text() : 'Sem resposta');
            process.exit(1);
        }
    } catch (err) {
        console.error("❌ Erro fatal de ligação:", err.message);
        process.exit(1);
    }

    // Filtrar torneios ativos
    if (!CHECK_ALL && !FILTER_ID) {
        const hoje = FILTER_DATA || new Date().toISOString().split('T')[0];
        const haQuatroDias = new Date(new Date(hoje).getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const daquiAQuatroDias = new Date(new Date(hoje).getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        torneios = torneios.filter(t => {
            if (t.data_fim && t.data_inicio) {
                return t.data_fim >= haQuatroDias && t.data_inicio <= daquiAQuatroDias;
            }
            return true;
        });
    }

    if (torneios.length === 0) {
        console.log("⚠️ Nenhum torneio ativo encontrado para monitorizar. Usa --todos ou --id=... para forçar.");
        process.exit(0);
    }

    console.log(`📋 Torneios selecionados (${torneios.length}):`);
    torneios.slice(0, 8).forEach(t => console.log(`   • ${t.nome} (ID: ${t.fpp_id})`));
    if (torneios.length > 8) console.log(`   ... e mais ${torneios.length - 8} torneios.`);

    let ciclo = 1;

    if (IS_LIVE_MODE) {
        console.log(`\n🔁 MODO SENTINELA ATIVO (Intervalo: ${INTERVAL_SECONDS}s). Pressione Ctrl+C para parar.\n`);
        while (true) {
            try {
                await executarCicloSentinela(ciclo++, torneios);
            } catch (err) {
                console.error("⚠️ Erro no ciclo sentinela:", err.message);
            }
            await delay(INTERVAL_SECONDS * 1000);
        }
    } else {
        await executarCicloSentinela(1, torneios);
        console.log("\n🏆 Verificação ao vivo concluída com sucesso!");
        process.exit(0);
    }
})();
