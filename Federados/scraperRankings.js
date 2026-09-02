process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const fetch = globalThis.fetch || require('node-fetch');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Credenciais do Supabase não encontradas.");
}

const headersSupabase = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates, return=minimal'
};

// 🚀 LER OS ARGUMENTOS DO TERMINAL
const args = process.argv.slice(2);
const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
};

const MAX_CONCURRENCY = parseInt(getArg('concurrency') || '3', 10);
const FILTER_CATEGORIA = getArg('categoria');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const urlFpp = 'https://tour.tiesports.com/fpp/weekly_rankings';

const TODAS_CATEGORIAS = [
    { nome: 'Absolutos - Masculinos', target: 'repeater_rankings_top_10$ctl00$link_load_more_men' },
    { nome: 'Absolutos - Femininos', target: 'repeater_rankings_top_10$ctl00$link_load_more_women' },
    { nome: 'Absolutos - Mistos', target: 'repeater_rankings_top_10$ctl00$link_load_more_mixed' },
    { nome: 'Jovens sub12 - Masculinos', target: 'repeater_rankings_top_10$ctl01$link_load_more_men' },
    { nome: 'Jovens sub12 - Femininos', target: 'repeater_rankings_top_10$ctl01$link_load_more_women' },
    { nome: 'Jovens sub14 - Masculinos', target: 'repeater_rankings_top_10$ctl02$link_load_more_men' },
    { nome: 'Jovens sub14 - Femininos', target: 'repeater_rankings_top_10$ctl02$link_load_more_women' },
    { nome: 'Jovens sub16 - Masculinos', target: 'repeater_rankings_top_10$ctl03$link_load_more_men' },
    { nome: 'Jovens sub16 - Femininos', target: 'repeater_rankings_top_10$ctl03$link_load_more_women' },
    { nome: 'Jovens sub18 - Masculinos', target: 'repeater_rankings_top_10$ctl04$link_load_more_men' },
    { nome: 'Jovens sub18 - Femininos', target: 'repeater_rankings_top_10$ctl04$link_load_more_women' },
    { nome: 'Veteranos - Masculinos', target: 'repeater_rankings_top_10$ctl05$link_load_more_men' },
    { nome: 'Veteranos - Femininos', target: 'repeater_rankings_top_10$ctl05$link_load_more_women' }
];

// -----------------------------------------------------------------------------
// INSERÇÃO EM LOTES COM RETRY NO SUPABASE (VIA REST API DIRETO)
// -----------------------------------------------------------------------------
async function bulkUpsert(tableName, dataArray, onConflict, chunkSize = 200, prefix = "") {
    if (!dataArray || dataArray.length === 0) return;

    for (let i = 0; i < dataArray.length; i += chunkSize) {
        const chunk = dataArray.slice(i, i + chunkSize);
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?on_conflict=${encodeURIComponent(onConflict)}`, {
                    method: 'POST',
                    headers: headersSupabase,
                    body: JSON.stringify(chunk)
                });

                if (res && res.ok) break;

                if (attempt === 3) {
                    const errText = res ? await res.text() : 'Sem resposta';
                    console.error(`${prefix} ❌ Erro ao guardar em ${tableName} (lote ${i}):`, errText);
                }
            } catch (err) {
                if (attempt === 3) {
                    console.error(`${prefix} ❌ Erro de rede em ${tableName} (lote ${i}):`, err.message);
                }
            }
            await delay(1000 * attempt);
        }
    }
}

// -----------------------------------------------------------------------------
// PROCESSAMENTO RÁPIDO DE UMA CATEGORIA
// -----------------------------------------------------------------------------
async function processarCategoria(cat, browser) {
    const prefix = `[${cat.nome}]`;
    const inicio = Date.now();
    console.log(`\n⏳ ${prefix} A iniciar extração ultra-rápida...`);

    let page = null;
    const dataExtracao = new Date().toISOString().split('T')[0];

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 1. Bloqueio de imagens, CSS e fontes para velocidade máxima
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort().catch(() => {});
            } else {
                req.continue().catch(() => {});
            }
        });

        // 2. Navegação rápida com domcontentloaded
        await page.goto(urlFpp, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(() => typeof Sys !== 'undefined' && Sys.WebForms && Sys.WebForms.PageRequestManager, { timeout: 20000 });

        const btnSelector = `a[href*="${cat.target}"]`;
        const btnExists = await page.$(btnSelector);
        const dadosExtraidos = [];

        if (!btnExists) {
            console.log(`${prefix} ⚠️ Botão 'Ver mais' não disponível. A ler do Top 10 inicial...`);
            const pageData = await page.evaluate((nomeCat) => {
                const h4s = Array.from(document.querySelectorAll('h4'));
                const targetH4 = h4s.find(h4 => h4.innerText.trim().includes(nomeCat));
                if (!targetH4) return [];

                let panel = targetH4.closest('.panel');
                if (!panel) return [];

                const table = panel.querySelector('table.lineup-table');
                if (!table) return [];

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                return rows.map(tr => {
                    const posNode = tr.querySelector('.lineup__pos span');
                    const nameNode = tr.querySelector('.lineup__name a');
                    const pointsNode = tr.querySelector('.lineup__num span');
                    if (!nameNode) return null;

                    let urlPerfil = nameNode.getAttribute('href') || '';
                    let licenca = null;
                    if (urlPerfil.includes('id=')) {
                        const parsedLic = parseInt(urlPerfil.split('id=')[1], 10);
                        licenca = isNaN(parsedLic) ? null : parsedLic;
                    }

                    return {
                        posicao: posNode ? posNode.innerText.trim() : "0",
                        licenca: licenca,
                        nome: nameNode.innerText.trim(),
                        pontos: pointsNode ? pointsNode.innerText.trim() : "0",
                        escalao: null,
                        variacao: null,
                        clube: null,
                        nivel: null,
                        qtd_torneios: null,
                        localidade: null,
                        mao: null,
                        torneios: []
                    };
                }).filter(Boolean);
            }, cat.nome);

            dadosExtraidos.push(...pageData);

        } else {
            console.log(`${prefix} 📄 A abrir ranking completo...`);

            // Clica no "Ver mais" e aguarda fim do pedido WebForms
            await page.evaluate((sel) => {
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        try { prm.remove_endRequest(handler); } catch(e) {}
                        resolve();
                    }, 12000);

                    const prm = Sys.WebForms.PageRequestManager.getInstance();
                    const handler = (sender, args) => {
                        clearTimeout(timeout);
                        prm.remove_endRequest(handler);
                        resolve();
                    };
                    prm.add_endRequest(handler);
                    const btn = document.querySelector(sel);
                    if (btn) btn.click();
                    else {
                        clearTimeout(timeout);
                        prm.remove_endRequest(handler);
                        resolve();
                    }
                });
            }, btnSelector);

            await page.waitForSelector('table.team-roster-table', { visible: true, timeout: 25000 });

            let hasNextPage = true;

            while (hasNextPage) {
                const activePageNum = await page.evaluate(() => {
                    const activeEl = document.querySelector('span[id*="DataPager_ranking_players"] .active');
                    return activeEl ? parseInt(activeEl.innerText.trim(), 10) : 1;
                });

                console.log(`${prefix}    ↳ A ler página ${activePageNum}...`);

                const pageData = await page.evaluate(() => {
                    const table = document.querySelectorAll('table.team-roster-table')[0];
                    if (!table) return [];
                    const rows = Array.from(table.querySelectorAll('tbody tr'));
                    return rows.map((tr, index) => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 5) {
                            const rawLic = tds[2].innerText.trim();
                            const lic = rawLic ? parseInt(rawLic, 10) : null;
                            const hasPointsBtn = !!tr.querySelector('input[value="Ver Pontos"]');
                            return {
                                rowIndex: index,
                                posicao: tds[0].innerText.trim(),
                                variacao: tds[1] ? tds[1].innerText.trim() : null,
                                licenca: isNaN(lic) ? null : lic,
                                nome: tds[3].innerText.trim(),
                                pontos: tds[4].innerText.trim(),
                                clube: tds.length > 5 ? tds[5].innerText.trim() : null,
                                nivel: tds.length > 6 ? tds[6].innerText.trim() : null,
                                escalao: tds.length > 7 ? tds[7].innerText.trim() : null,
                                qtd_torneios: tds.length > 8 ? parseInt(tds[8].innerText.trim(), 10) : 0,
                                hasPointsBtn: hasPointsBtn,
                                localidade: null,
                                mao: null,
                                torneios: []
                            };
                        }
                        return null;
                    }).filter(Boolean);
                });

                // Ler modais de pontos dos jogadores sem pausas artificiais mortas
                const rowsCount = pageData.length;
                for (let i = 0; i < rowsCount; i++) {
                    const player = pageData[i];
                    if (!player.hasPointsBtn) continue;

                    try {
                        const resModal = await page.evaluate((rowIndex) => {
                            return new Promise((resolve) => {
                                const timeout = setTimeout(() => {
                                    try { prm.remove_endRequest(handler); } catch(e) {}
                                    resolve({ ok: false, timeout: true });
                                }, 7000);

                                const prm = Sys.WebForms.PageRequestManager.getInstance();
                                const handler = (sender, args) => {
                                    clearTimeout(timeout);
                                    prm.remove_endRequest(handler);
                                    resolve({ ok: true });
                                };
                                prm.add_endRequest(handler);

                                const table = document.querySelector('table.team-roster-table');
                                const rows = table ? table.querySelectorAll('tbody tr') : [];
                                if (rows[rowIndex]) {
                                    const btn = rows[rowIndex].querySelector('input[value="Ver Pontos"]');
                                    if (btn) btn.click();
                                    else {
                                        clearTimeout(timeout);
                                        prm.remove_endRequest(handler);
                                        resolve({ ok: false });
                                    }
                                } else {
                                    clearTimeout(timeout);
                                    prm.remove_endRequest(handler);
                                    resolve({ ok: false });
                                }
                            });
                        }, player.rowIndex);

                        if (resModal && resModal.ok) {
                            const playerExtraInfo = await page.evaluate(() => {
                                const locationNode = document.querySelector('[id*="lbl_ranking_points_player_from"]');
                                const handNode = document.querySelector('[id*="lbl_ranking_points_player_plays"]');
                                const torneios = [];

                                // 1. Contabilizados
                                const tableContabilizados = document.querySelector('#tab-ranking-points-countable-tournaments table');
                                if (tableContabilizados) {
                                    const trs = Array.from(tableContabilizados.querySelectorAll('tbody tr'));
                                    trs.forEach(tr => {
                                        const tds = tr.querySelectorAll('td');
                                        if (tds.length >= 5) {
                                            torneios.push({
                                                nome_torneio: tds[0].innerText.trim(),
                                                escalao_torneio: tds[1].innerText.trim(),
                                                resultado: tds[2].innerText.trim(),
                                                pontos: tds[3].innerText.trim(),
                                                data_torneio: tds[4].innerText.trim(),
                                                contabilizado: true
                                            });
                                        }
                                    });
                                }

                                // 2. Não contabilizados
                                const tableNaoContabilizados = document.querySelector('#tab-ranking-points-non-countable-tournaments table');
                                if (tableNaoContabilizados) {
                                    const trs = Array.from(tableNaoContabilizados.querySelectorAll('tbody tr'));
                                    trs.forEach(tr => {
                                        const tds = tr.querySelectorAll('td');
                                        if (tds.length >= 5) {
                                            torneios.push({
                                                nome_torneio: tds[0].innerText.trim(),
                                                escalao_torneio: tds[1].innerText.trim(),
                                                resultado: tds[2].innerText.trim(),
                                                pontos: tds[3].innerText.trim(),
                                                data_torneio: tds[4].innerText.trim(),
                                                contabilizado: false
                                            });
                                        }
                                    });
                                }

                                return {
                                    localidade: locationNode ? locationNode.innerText.trim() : null,
                                    mao: handNode ? handNode.innerText.trim() : null,
                                    torneios: torneios
                                };
                            });

                            player.localidade = playerExtraInfo.localidade;
                            player.mao = playerExtraInfo.mao;
                            player.torneios = playerExtraInfo.torneios;

                            // Fechar modal imediatamente sem sleep
                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('[data-dismiss="modal"], .close, .RadWindow .rwCloseButton');
                                if (closeBtn) closeBtn.click();
                            });
                        }
                    } catch(e) {
                        // Prossegue para o próximo jogador caso haja timeout num modal
                    }
                }

                dadosExtraidos.push(...pageData);

                // Paginação segura para a próxima página
                const targetPageNum = activePageNum + 1;
                const pageNavResult = await page.evaluate((targetNum) => {
                    const pager = document.querySelector('span[id*="DataPager_ranking_players"]');
                    if (!pager) return { canNavigate: false };

                    const links = Array.from(pager.querySelectorAll('a'));
                    let linkToClick = links.find(a => a.innerText.trim() === String(targetNum));

                    if (!linkToClick) {
                        const children = Array.from(pager.children);
                        const activeIdx = children.findIndex(el => el.classList.contains('active'));
                        const forwardDot = children.find((el, idx) => idx > activeIdx && el.innerText && el.innerText.trim() === '...');
                        if (forwardDot && forwardDot.tagName === 'A') {
                            linkToClick = forwardDot;
                        }
                    }

                    if (!linkToClick) return { canNavigate: false };

                    return new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            try { prm.remove_endRequest(handler); } catch(e) {}
                            resolve({ canNavigate: false, timeout: true });
                        }, 12000);

                        const prm = Sys.WebForms.PageRequestManager.getInstance();
                        const handler = (sender, args) => {
                            clearTimeout(timeout);
                            prm.remove_endRequest(handler);
                            resolve({ canNavigate: true });
                        };
                        prm.add_endRequest(handler);
                        linkToClick.click();
                    });
                }, targetPageNum);

                if (!pageNavResult.canNavigate) {
                    hasNextPage = false;
                }
            }
        }

        // Processar e guardar no Supabase
        const formatados = dadosExtraidos.filter(d => d.licenca).map(d => {
            let pontosNumero = parseFloat(d.pontos.replace(/\./g, '').replace(',', '.')) || 0;
            let pos = parseInt(d.posicao, 10) || 0;
            return {
                licenca: d.licenca,
                nome: d.nome,
                categoria: cat.nome,
                posicao: pos,
                pontos: pontosNumero,
                escalao: d.escalao,
                variacao: d.variacao,
                clube: d.clube,
                nivel: d.nivel,
                qtd_torneios: d.qtd_torneios,
                localidade: d.localidade,
                mao: d.mao,
                data_atualizacao: dataExtracao,
                _torneios: d.torneios
            };
        });

        const unicos = [];
        const licensasVistas = new Set();
        for (const f of formatados) {
            if (!licensasVistas.has(f.licenca)) {
                licensasVistas.add(f.licenca);
                unicos.push(f);
            }
        }

        unicos.sort((a,b) => a.posicao - b.posicao);

        const torneiosParaInserir = [];
        for (const f of unicos) {
            if (f._torneios && f._torneios.length > 0) {
                for (const t of f._torneios) {
                    let pts = parseFloat(t.pontos.replace(/\./g, '').replace(',', '.')) || 0;
                    torneiosParaInserir.push({
                        licenca: f.licenca,
                        categoria: f.categoria,
                        nome_torneio: t.nome_torneio,
                        escalao_torneio: t.escalao_torneio,
                        resultado: t.resultado,
                        pontos: pts,
                        data_torneio: t.data_torneio,
                        contabilizado: t.contabilizado,
                        data_atualizacao: dataExtracao
                    });
                }
            }
            delete f._torneios;
        }

        const torneiosUnicos = [];
        const torneiosVistos = new Set();
        for (const t of torneiosParaInserir) {
            const key = `${t.licenca}_${t.nome_torneio}_${t.escalao_torneio}_${t.data_atualizacao}`;
            if (!torneiosVistos.has(key)) {
                torneiosVistos.add(key);
                torneiosUnicos.push(t);
            }
        }

        console.log(`${prefix} 💾 A guardar ${unicos.length} jogadores e ${torneiosUnicos.length} torneios no Supabase...`);

        if (unicos.length > 0) {
            await bulkUpsert('rankingsfpp', unicos, 'licenca, categoria, data_atualizacao', 200, prefix);
        }

        if (torneiosUnicos.length > 0) {
            await bulkUpsert('rankingsfpp_torneios', torneiosUnicos, 'licenca, nome_torneio, escalao_torneio, data_atualizacao', 200, prefix);
        }

        const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`✅ ${prefix} Concluído em ${duracao}s! (${unicos.length} jogadores | ${torneiosUnicos.length} torneios).`);
        return { status: 'sucesso', jogadores: unicos.length, torneios: torneiosUnicos.length };

    } catch (err) {
        console.error(`❌ ${prefix} Erro geral:`, err.message);
        return { status: 'erro', error: err.message };
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
    }
}

// -----------------------------------------------------------------------------
// ARRANQUE COM CONCORRÊNCIA PARALELA
// -----------------------------------------------------------------------------
(async () => {
    console.log("==========================================================");
    console.log("🚀 A iniciar Extração Concorrente de Rankings FPP...");
    console.log(`⚙️ Concorrência: ${MAX_CONCURRENCY} Categorias em simultâneo`);
    console.log("==========================================================");

    let categoriasAlvo = TODAS_CATEGORIAS;
    if (FILTER_CATEGORIA) {
        categoriasAlvo = categoriasAlvo.filter(c => c.nome.toLowerCase().includes(FILTER_CATEGORIA.toLowerCase()));
    }

    console.log(`📋 Total de Categorias a extrair: ${categoriasAlvo.length}\n`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const inicioGeral = Date.now();
    const emExecucao = [];
    let totalJogadores = 0;
    let totalTorneios = 0;

    for (const cat of categoriasAlvo) {
        const p = processarCategoria(cat, browser).then((res) => {
            if (res && res.status === 'sucesso') {
                totalJogadores += (res.jogadores || 0);
                totalTorneios += (res.torneios || 0);
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

    const duracaoTotal = ((Date.now() - inicioGeral) / 1000 / 60).toFixed(1);
    console.log("\n==========================================================");
    console.log(`🏆 RANKINGS ATUALIZADOS COM SUCESSO EM ${duracaoTotal} MINUTOS!`);
    console.log(`👥 Total de Jogadores guardados: ${totalJogadores}`);
    console.log(`🎾 Total de Registos de Torneios: ${totalTorneios}`);
    console.log("==========================================================");
    process.exit(0);
})();
