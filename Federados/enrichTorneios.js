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

const FILTER_ID = getArg('id');
const FILTER_LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const FILTER_CATEGORIA = getArg('categoria');
const FILTER_ANO = getArg('ano');
const MAX_CONCURRENCY = parseInt(getArg('concurrency') || '6', 10);
const APENAS_ATIVOS = args.includes('--ativos') || args.includes('--recentes');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// MOTOR DE REDE & SUPABASE (REST DIRETO COM RETRY E BACKOFF)
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

async function limparDadosAntigos(torneio_id, prefix = "") {
    try {
        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp_duplas?torneio_id=eq.${encodeURIComponent(torneio_id)}`, {
            method: 'DELETE',
            headers
        });

        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches?torneio_id=eq.${encodeURIComponent(torneio_id)}`, {
            method: 'DELETE',
            headers
        });
    } catch (e) {
        console.error(`${prefix} ⚠️ Erro ao limpar dados antigos de ${torneio_id}:`, e.message);
    }
}

async function bulkInsert(tableName, dataArray, chunkSize = 100, prefix = "") {
    if (!dataArray || dataArray.length === 0) return;

    for (let i = 0; i < dataArray.length; i += chunkSize) {
        const chunk = dataArray.slice(i, i + chunkSize);
        const url = `${SUPABASE_URL}/rest/v1/${tableName}`;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetchWithRetry(url, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(chunk)
                });

                if (res && res.ok) break;
                const errText = res ? await res.text() : 'Sem resposta';
                if (attempt === 3) {
                    console.error(`${prefix} 🚨 Erro a inserir lote em ${tableName}: ${errText}`);
                } else {
                    await delay(1000 * attempt);
                }
            } catch (err) {
                if (attempt === 3) console.error(`${prefix} 🚨 Exceção em bulkInsert (${tableName}): ${err.message}`);
                await delay(1000 * attempt);
            }
        }
    }
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
// PROCESSAMENTO DE UM TORNEIO
// -----------------------------------------------------------------------------
async function processarTorneio(torneio, browser, prefix) {
    let page = null;
    const inicio = Date.now();

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Otimizar carregamento de páginas bloqueando recursos pesados
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort().catch(() => {});
            } else {
                req.continue().catch(() => {});
            }
        });

        // Construir URL dos Draws
        let urlDraws = torneio.url_tiepadel.trim();
        if (urlDraws.endsWith('/')) urlDraws = urlDraws.slice(0, -1);
        if (!urlDraws.toLowerCase().endsWith('/draws')) urlDraws += '/Draws';

        try {
            await page.goto(urlDraws, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('select[id$="drop_tournaments"], #drop_tournaments', { visible: true, timeout: 8000 });
        } catch (e) {
            console.log(`${prefix} ⚠️ Quadros ainda não publicados ou página indisponível.`);
            return { status: 'sem_quadros' };
        }

        // Extrair todas as categorias do dropdown
        const categorias = await safeEvaluate(page, () => {
            const select = document.querySelector('select[id$="drop_tournaments"], #drop_tournaments');
            if (!select) return [];
            return Array.from(select.options)
                .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                .map(opt => ({ value: opt.value, sigla: opt.innerText.trim() }));
        });

        if (!categorias || categorias.length === 0) {
            console.log(`${prefix} ⚠️ Sem categorias disponíveis no dropdown de quadros.`);
            return { status: 'sem_quadros' };
        }

        let categoriasAlvo = categorias;
        if (FILTER_CATEGORIA) {
            categoriasAlvo = categoriasAlvo.filter(c => c.sigla.toLowerCase().includes(FILTER_CATEGORIA.toLowerCase()));
        }

        console.log(`${prefix} 🎾 Categorias encontradas (${categoriasAlvo.length}): ${categoriasAlvo.map(c => c.sigla).join(', ')}`);

        // Limpar dados anteriores do torneio apenas após confirmar que há quadros
        await limparDadosAntigos(torneio.fpp_id, prefix);

        let totalDuplasTorneio = 0;
        let totalJogosTorneio = 0;

        for (const cat of categoriasAlvo) {
            try {
                // Selecionar categoria
                const dropdownExiste = await page.$('select[id$="drop_tournaments"], #drop_tournaments');
                if (!dropdownExiste) {
                    await page.goto(urlDraws, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                    await page.waitForSelector('select[id$="drop_tournaments"], #drop_tournaments', { visible: true, timeout: 6000 }).catch(() => {});
                }

                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
                    page.select('select[id$="drop_tournaments"], #drop_tournaments', cat.value)
                ]);
                await delay(600);

                // Descobrir Fases / Separadores disponíveis (ex: Principal, Qualificação, Grupos, Poules)
                const fases = await safeEvaluate(page, () => {
                    const links = document.querySelectorAll('a[id*="repeater_pages"], a[id*="repeater_groups"], ul.nav-tabs a, .draw-tabs a');
                    if (links.length === 0) return [{ id: null, nome: 'Principal' }];
                    return Array.from(links)
                        .filter(l => l.innerText.trim() !== "")
                        .map(l => ({ id: l.id, nome: l.innerText.trim() }));
                });

                const listaFases = (fases && fases.length > 0) ? fases : [{ id: null, nome: 'Principal' }];

                let todasDuplasCat = [];
                let todosJogosCat = [];

                for (const fase of listaFases) {
                    if (fase.id) {
                        try {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
                                safeEvaluate(page, (targetId) => {
                                    const el = document.getElementById(targetId);
                                    if (el) el.click();
                                }, fase.id)
                            ]);
                            await delay(500);
                        } catch (navErr) {}
                    }

                    // Extração robusta do DOM
                    const extraidos = await safeEvaluate(page, (siglaCat, nomeFase, torneioId) => {
                        const duplas = [];
                        const jogos = [];

                        // 1. DUPLAS EM QUADROS DE ELIMINAÇÃO (table.new_draw)
                        document.querySelectorAll('table.new_draw tr').forEach(tr => {
                            const indexEl = tr.querySelector('.index');
                            if (indexEl && indexEl.innerText.trim() !== "") {
                                const p1 = tr.querySelector('span[id*="_ply_"]');
                                const p2 = tr.nextElementSibling ? tr.nextElementSibling.querySelector('span[id*="_ply_"]') : null;

                                if (p1 && p2) {
                                    const getInfo = (el, type) => {
                                        try {
                                            const idParts = el.id.split('_ply_');
                                            const target = document.getElementById(`${idParts[0]}_${type}_${idParts[1]}`);
                                            return target ? target.innerText.trim() : '';
                                        } catch(e) { return ''; }
                                    };

                                    const nomeA = p1.innerText.trim();
                                    const nomeB = p2.innerText.trim();

                                    if (nomeA && nomeB && !nomeA.toLowerCase().includes('bye') && !nomeB.toLowerCase().includes('bye')) {
                                        duplas.push({
                                            torneio_id: torneioId,
                                            categoria: siglaCat,
                                            fase: nomeFase,
                                            cabeca_serie: tr.querySelector('span[id*="_lbl_dsc_"]')?.innerText.trim() || '',
                                            nome_a: nomeA,
                                            licenca_a: getInfo(p1, 'lic'),
                                            pontos_a: getInfo(p1, 'ranking'),
                                            nome_b: nomeB,
                                            licenca_b: getInfo(p2, 'lic'),
                                            pontos_b: getInfo(p2, 'ranking')
                                        });
                                    }
                                }
                            }
                        });

                        // 2. DUPLAS EM FASES DE GRUPOS (table.table ou tabelas de grupo)
                        document.querySelectorAll('table.table tr, table.rgMasterTable tr').forEach(tr => {
                            const tds = Array.from(tr.querySelectorAll('td'));
                            if (tds.length >= 2) {
                                const tdEquipa = tds.find(td => td.innerText.includes('/') || td.querySelector('a'));
                                if (tdEquipa && !tdEquipa.innerText.toLowerCase().includes('equipa') && !tdEquipa.innerText.toLowerCase().includes('casa')) {
                                    const nomes = tdEquipa.innerText.split('/');
                                    if (nomes.length === 2) {
                                        const nA = nomes[0].trim();
                                        const nB = nomes[1].trim();
                                        if (nA && nB && !nA.toLowerCase().includes('bye') && !nB.toLowerCase().includes('bye')) {
                                            duplas.push({
                                                torneio_id: torneioId,
                                                categoria: siglaCat,
                                                fase: nomeFase,
                                                cabeca_serie: '',
                                                nome_a: nA,
                                                licenca_a: 'N/A',
                                                pontos_a: '0',
                                                nome_b: nB,
                                                licenca_b: 'N/A',
                                                pontos_b: '0'
                                            });
                                        }
                                    }
                                }
                            }
                        });

                        // 3. JOGOS EM QUADROS ELIMINATÓRIOS E MATRICIAIS
                        const jogosRaw = [];

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

                        // 4. DEDUZIR RONDAS GEOMETRICAMENTE COM BASE NA COLUNA X
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

                        // Jogos de Fase de Grupos
                        otherMatches.forEach(j => {
                            j.ronda = 'Fase de Grupos';
                            jogos.push(j);
                        });

                        return {
                            duplas,
                            jogos: jogos.map(j => ({
                                torneio_id: j.torneio_id,
                                categoria: j.categoria,
                                fase: j.fase,
                                ronda: j.ronda,
                                equipa_a: j.equipa_a,
                                equipa_b: j.equipa_b,
                                resultado: j.resultado,
                                data_hora_campo: j.data_hora_campo
                            }))
                        };
                    }, cat.sigla, fase.nome, torneio.fpp_id);

                    if (extraidos.duplas && extraidos.duplas.length > 0) {
                        todasDuplasCat.push(...extraidos.duplas);
                    }
                    if (extraidos.jogos && extraidos.jogos.length > 0) {
                        todosJogosCat.push(...extraidos.jogos);
                    }
                }

                // Desduplicar duplas nesta categoria
                const duplasUnicas = [...new Map(todasDuplasCat.map(d => [`${d.categoria}|${d.nome_a}|${d.nome_b}`, d])).values()];
                // Desduplicar jogos nesta categoria
                const jogosUnicos = [...new Map(todosJogosCat.map(j => [`${j.categoria}|${j.fase}|${j.ronda}|${j.equipa_a}|${j.equipa_b}`, j])).values()];

                if (duplasUnicas.length > 0) {
                    await bulkInsert('torneiosfpp_duplas', duplasUnicas, 100, prefix);
                    totalDuplasTorneio += duplasUnicas.length;
                }
                if (jogosUnicos.length > 0) {
                    await bulkInsert('torneiosfpp_matches', jogosUnicos, 100, prefix);
                    totalJogosTorneio += jogosUnicos.length;
                }

                console.log(`${prefix}    ↳ [${cat.sigla}] Extraídos: ${duplasUnicas.length} duplas, ${jogosUnicos.length} jogos.`);
            } catch (catErr) {
                console.error(`${prefix}    ❌ Erro na categoria ${cat.sigla}:`, catErr.message);
            }
        }

        const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`${prefix} ✅ Concluído em ${duracao}s! (Total: ${totalDuplasTorneio} duplas | ${totalJogosTorneio} jogos)`);
        return { status: 'sucesso', duplas: totalDuplasTorneio, jogos: totalJogosTorneio };

    } catch (err) {
        console.error(`${prefix} ❌ Falha crítica ao processar torneio:`, err.message);
        return { status: 'erro', error: err.message };
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
    }
}

// -----------------------------------------------------------------------------
// MOTOR PRINCIPAL CONCORRENTE
// -----------------------------------------------------------------------------
(async () => {
    console.log("==========================================================");
    console.log("🚀 A iniciar Extração Concorrente de Torneios Federados...");
    console.log("==========================================================");

    // 1. Obter Lista de Torneios do Supabase
    let urlQuery = `${SUPABASE_URL}/rest/v1/torneiosfpp?url_tiepadel=not.is.null&select=fpp_id,nome,url_tiepadel,data_inicio,data_fim,data_corrida,ano`;

    if (FILTER_ID) {
        urlQuery += `&fpp_id=eq.${encodeURIComponent(FILTER_ID)}`;
    }
    if (FILTER_ANO) {
        urlQuery += `&ano=eq.${encodeURIComponent(FILTER_ANO)}`;
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

    // Filtrar ativos/recentes se pedido
    if (APENAS_ATIVOS) {
        const hoje = new Date();
        const haSeteDias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const daquiASeteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        torneios = torneios.filter(t => {
            if (t.data_fim && t.data_inicio) {
                return t.data_fim >= haSeteDias && t.data_inicio <= daquiASeteDias;
            }
            return true; // Se não tem datas estruturadas, mantém para não descartar
        });
    }

    if (FILTER_LIMIT && FILTER_LIMIT > 0) {
        torneios = torneios.slice(0, FILTER_LIMIT);
    }

    console.log(`📋 Total de Torneios a extrair: ${torneios.length}`);
    console.log(`⚙️ Concorrência: ${MAX_CONCURRENCY} Browsers paralelos\n`);

    if (torneios.length === 0) {
        console.log("⚠️ Nenhum torneio encontrado com os filtros fornecidos. A terminar.");
        process.exit(0);
    }

    // Arrancar Puppeteer
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    let totalSucesso = 0;
    let totalSemQuadros = 0;
    let totalErros = 0;
    let totalDuplasGeral = 0;
    let totalJogosGeral = 0;

    const emExecucao = [];

    for (let i = 0; i < torneios.length; i++) {
        const torneio = torneios[i];
        const prefix = `[${i + 1}/${torneios.length}] [${torneio.nome}]`;

        const p = processarTorneio(torneio, browser, prefix).then((res) => {
            if (res.status === 'sucesso') {
                totalSucesso++;
                totalDuplasGeral += (res.duplas || 0);
                totalJogosGeral += (res.jogos || 0);
            } else if (res.status === 'sem_quadros') {
                totalSemQuadros++;
            } else {
                totalErros++;
            }
            emExecucao.splice(emExecucao.indexOf(p), 1);
        });

        emExecucao.push(p);

        if (emExecucao.length >= MAX_CONCURRENCY) {
            await Promise.race(emExecucao);
        }
    }

    await Promise.all(emExecucao);
    await browser.close().catch(() => {});

    console.log("\n==========================================================");
    console.log("🏆 RELATÓRIO FINAL DA EXTRAÇÃO DE FEDERADOS");
    console.log("==========================================================");
    console.log(`✅ Torneios extraídos com sucesso: ${totalSucesso}`);
    console.log(`⚠️ Torneios sem quadros publicados: ${totalSemQuadros}`);
    console.log(`❌ Torneios com erros: ${totalErros}`);
    console.log(`👥 Total de Duplas guardadas: ${totalDuplasGeral}`);
    console.log(`🎾 Total de Jogos guardados: ${totalJogosGeral}`);
    console.log(`📋 Total de Torneios analisados: ${torneios.length}`);
    console.log("🏁 Processo concluído com sucesso!");
    process.exit(0);
})();