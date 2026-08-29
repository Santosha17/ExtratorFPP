process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
require('dotenv').config({ path: '../.env' });
// Polyfill de WebSocket para Node.js < 22 (evita erro de Realtime no @supabase/supabase-js)
if (typeof WebSocket === 'undefined') {
    try {
        globalThis.WebSocket = require('ws');
    } catch (e) {
        globalThis.WebSocket = class DummyWebSocket {};
    }
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Credenciais do Supabase não encontradas no ficheiro .env!");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const getArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
};
const FILTER_ID = getArg('id');
const FILTER_LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const APENAS_ATIVOS = args.includes('--ativos') || args.includes('--recentes');

/**
 * Executa uma operação assíncrona com tentativas de repetição e backoff exponencial.
 */
async function withRetry(operation, maxRetries = 3, initialDelay = 1000) {
    let attempt = 0;
    let currentDelay = initialDelay;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                throw error;
            }
            console.log(`      ⚠️ Falha temporária (${error.message || error}). A tentar novamente em ${currentDelay}ms (tentativa ${attempt}/${maxRetries})...`);
            await delay(currentDelay);
            currentDelay *= 2;
        }
    }
}

/**
 * Apaga os dados antigos do torneio antes de inserir os novos para evitar duplicados.
 */
async function limparDadosAntigos(torneio_id) {
    await withRetry(async () => {
        const { error: errDuplas } = await supabase
            .from('torneiosfpp_duplas')
            .delete()
            .eq('torneio_id', torneio_id);
        if (errDuplas) throw new Error(`Erro ao apagar duplas antigas: ${errDuplas.message}`);

        const { error: errMatches } = await supabase
            .from('torneiosfpp_matches')
            .delete()
            .eq('torneio_id', torneio_id);
        if (errMatches) throw new Error(`Erro ao apagar matches antigos: ${errMatches.message}`);
    });
}

/**
 * Insere registos em lotes (chunks) com retry para evitar erros de payload e timeout.
 */
async function bulkInsert(tableName, dataArray, chunkSize = 100) {
    if (!dataArray || dataArray.length === 0) return;
    for (let i = 0; i < dataArray.length; i += chunkSize) {
        const chunk = dataArray.slice(i, i + chunkSize);
        await withRetry(async () => {
            const { error } = await supabase
                .from(tableName)
                .insert(chunk);
            if (error) {
                throw new Error(`Erro ao inserir em ${tableName}: ${error.message}`);
            }
        });
    }
}

(async () => {
    console.log("📥 A contactar Supabase para obter a lista de torneios...");

    let torneios = [];
    try {
        await withRetry(async () => {
            let query = supabase
                .from('torneiosfpp')
                .select('fpp_id, nome, url_tiepadel, data_inicio, data_fim')
                .not('url_tiepadel', 'is', null);

            if (FILTER_ID) {
                query = query.eq('fpp_id', FILTER_ID);
            }

            if (APENAS_ATIVOS) {
                const hoje = new Date();
                const haSeteDias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const daquiASeteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                query = query.gte('data_fim', haSeteDias).lte('data_inicio', daquiASeteDias);
            }

            const { data, error } = await query;
            if (error) throw new Error(error.message);
            torneios = data || [];
        });
    } catch (err) {
        console.error("❌ Falha crítica ao obter lista de torneios do Supabase:", err.message);
        process.exit(1);
    }

    if (FILTER_LIMIT && FILTER_LIMIT > 0) {
        torneios = torneios.slice(0, FILTER_LIMIT);
    }

    console.log(`🔍 Encontrados ${torneios.length} torneios para raspar.`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    let totalSucesso = 0;
    let totalSemQuadros = 0;
    let totalErros = 0;

    for (let i = 0; i < torneios.length; i++) {
        const torneio = torneios[i];
        console.log(`\n🎾 [${i + 1}/${torneios.length}] A extrair: ${torneio.nome} (ID: ${torneio.fpp_id})`);

        let page = null;
        try {
            page = await browser.newPage();

            // Otimizar o carregamento de páginas (ignora imagens, CSS e fontes desnecessárias)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                if (['image', 'stylesheet', 'font'].includes(resourceType)) {
                    req.abort().catch(() => {});
                } else {
                    req.continue().catch(() => {});
                }
            });

            await page.goto(torneio.url_tiepadel + "/Draws", { waitUntil: 'networkidle2', timeout: 45000 });

            // Verificar se o torneio tem quadros (dropdown)
            const temQuadros = await page.evaluate(() => document.querySelector('select[id$="drop_tournaments"]') !== null);
            if (!temQuadros) {
                console.log("   ⚠️ Quadros ainda não publicados.");
                totalSemQuadros++;
                continue;
            }

            // Apanhar todas as categorias (Ex: M1, M2, F3)
            const categorias = await page.evaluate(() => {
                const opts = document.querySelectorAll('select[id$="drop_tournaments"] option');
                return Array.from(opts).slice(1).map(o => ({ value: o.value, sigla: o.innerText.trim() }));
            });

            if (categorias.length === 0) {
                console.log("   ⚠️ Sem categorias disponíveis no dropdown.");
                totalSemQuadros++;
                continue;
            }

            // Limpa dados antigos apenas após confirmar que há quadros a extrair
            await limparDadosAntigos(torneio.fpp_id);

            for (const cat of categorias) {
                console.log(`   ⏳ Categoria: ${cat.sigla}`);

                try {
                    // 1. Recarregar a página base limpa antes de cada categoria
                    await page.goto(torneio.url_tiepadel + "/Draws", { waitUntil: 'networkidle2', timeout: 35000 });
                    await delay(1000);

                    // 2. Verificar se o dropdown existe
                    const dropdownExiste = await page.evaluate(() => document.querySelector('select[id$="drop_tournaments"]') !== null);
                    if (!dropdownExiste) {
                        console.log("      ⚠️ Dropdown desapareceu. A saltar...");
                        continue;
                    }

                    // 3. Selecionar a categoria e aguardar navegação
                    const navPromiseCat = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {});
                    await page.select('select[id$="drop_tournaments"]', cat.value);
                    await navPromiseCat;
                    await delay(1200);

                    // Apanhar as Fases (Ex: Grupos, Qualificação, Main)
                    const fases = await page.evaluate(() => {
                        const links = document.querySelectorAll('a[id*="repeater_pages"]');
                        if (links.length === 0) return [{ id: null, nome: 'Principal' }];
                        return Array.from(links).map(l => ({ id: l.id, nome: l.innerText.trim() }));
                    });

                    let todasDuplasCat = [];
                    let todosJogosCat = [];

                    for (const fase of fases) {
                        if (fase.id) {
                            const navPromiseFase = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {});
                            await page.click(`#${fase.id}`);
                            await navPromiseFase;
                            await delay(1200);
                        }

                        // ====== INÍCIO DA EXTRAÇÃO DO HTML ======
                        const extraidos = await page.evaluate((siglaCat, nomeFase) => {
                            const duplas = [];
                            const jogos = [];

                            // 1. Extrair Duplas (Quadros de Eliminação)
                            document.querySelectorAll('table.new_draw tr').forEach(tr => {
                                const indexEl = tr.querySelector('.index');
                                if (indexEl && indexEl.innerText.trim() !== "") {
                                    const p1 = tr.querySelector('span[id*="_ply_"]');
                                    const p2 = tr.nextElementSibling ? tr.nextElementSibling.querySelector('span[id*="_ply_"]') : null;

                                    if (p1 && p2) {
                                        const getInfo = (el, type) => {
                                            try {
                                                const idParts = el.id.split('_ply_');
                                                return document.getElementById(`${idParts[0]}_${type}_${idParts[1]}`).innerText.trim();
                                            } catch(e) { return ''; }
                                        };

                                        duplas.push({
                                            categoria: siglaCat,
                                            fase: nomeFase,
                                            cabeca_serie: tr.querySelector('span[id*="_lbl_dsc_"]')?.innerText.trim() || '',
                                            nome_a: p1.innerText.trim(),
                                            licenca_a: getInfo(p1, 'lic'),
                                            pontos_a: getInfo(p1, 'ranking'),
                                            nome_b: p2.innerText.trim(),
                                            licenca_b: getInfo(p2, 'lic'),
                                            pontos_b: getInfo(p2, 'ranking')
                                        });
                                    }
                                }
                            });

                            // 2. Extrair Duplas (Fase de Grupos)
                            document.querySelectorAll('table.table tr').forEach(tr => {
                                const tds = tr.querySelectorAll('td');
                                if (tds.length >= 2) {
                                    const tdEquipa = Array.from(tds).find(td => td.innerText.includes('/') || td.querySelector('a'));
                                    if (tdEquipa && !tdEquipa.innerText.toLowerCase().includes('equipa')) {
                                        const nomes = tdEquipa.innerText.split('/');
                                        if (nomes.length === 2) {
                                            duplas.push({
                                                categoria: siglaCat,
                                                fase: nomeFase,
                                                cabeca_serie: '',
                                                nome_a: nomes[0].trim(),
                                                licenca_a: 'N/A',
                                                pontos_a: '0',
                                                nome_b: nomes[1].trim(),
                                                licenca_b: 'N/A',
                                                pontos_b: '0'
                                            });
                                        }
                                    }
                                }
                            });

                            // 3. Extrair Jogos e deduzir rondas por coordenadas X
                            const jogosRaw = [];

                            document.querySelectorAll('span[id*="_lbl_score_"]').forEach(scoreEl => {
                                const idParts = scoreEl.id.split('_lbl_score_');
                                if (idParts.length === 2) {
                                    const prefix = idParts[0], matchId = idParts[1];
                                    const p1a = document.getElementById(`${prefix}_lbl_ply_${matchId}_a_1`)?.innerText.trim();
                                    const p2a = document.getElementById(`${prefix}_lbl_ply_${matchId}_a_2`)?.innerText.trim();
                                    const p1b = document.getElementById(`${prefix}_lbl_ply_${matchId}_b_1`)?.innerText.trim();
                                    const p2b = document.getElementById(`${prefix}_lbl_ply_${matchId}_b_2`)?.innerText.trim();

                                    const equipaA = [p1a, p2a].filter(Boolean).join(' / ');
                                    const equipaB = [p1b, p2b].filter(Boolean).join(' / ');

                                    if (equipaA && equipaB && !equipaA.toLowerCase().includes('bye') && !equipaB.toLowerCase().includes('bye')) {
                                        let dataHoraCampo = '';

                                        const parentTd = scoreEl.closest('td');
                                        if (parentTd) {
                                            let dateSpan = parentTd.querySelector('.date, .time, [id*="lbl_date"]');
                                            if (!dateSpan && parentTd.previousElementSibling) {
                                                dateSpan = parentTd.previousElementSibling.querySelector('.date, .time');
                                            }
                                            if (!dateSpan && parentTd.parentElement) {
                                                dateSpan = parentTd.parentElement.querySelector('.date, .time');
                                            }
                                            if (dateSpan) dataHoraCampo = dateSpan.innerText.trim();

                                            const rect = parentTd.getBoundingClientRect();
                                            jogosRaw.push({
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

                            // Agrupar e Calcular a Ronda Matematicamente com base na coluna (Eixo X)
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
                                    if (fromEnd < roundNamesEndToStart.length) {
                                        ronda = roundNamesEndToStart[fromEnd];
                                    }
                                    j.ronda = ronda;
                                    jogos.push(j);
                                });
                            }

                            // Jogos de Fase de grupos ou outros
                            otherMatches.forEach(j => {
                                j.ronda = 'Fase de Grupos';
                                jogos.push(j);
                            });

                            return {
                                duplas,
                                jogos: jogos.map(j => ({
                                    categoria: j.categoria,
                                    fase: j.fase,
                                    ronda: j.ronda,
                                    equipa_a: j.equipa_a,
                                    equipa_b: j.equipa_b,
                                    resultado: j.resultado,
                                    data_hora_campo: j.data_hora_campo
                                }))
                            };
                        }, cat.sigla, fase.nome);
                        // ====== FIM DA EXTRAÇÃO ======

                        extraidos.duplas.forEach(d => { d.torneio_id = torneio.fpp_id; todasDuplasCat.push(d); });
                        extraidos.jogos.forEach(j => { j.torneio_id = torneio.fpp_id; todosJogosCat.push(j); });
                    }

                    // Gravar no Supabase por Categoria (com batching e retry)
                    if (todasDuplasCat.length > 0) {
                        await bulkInsert('torneiosfpp_duplas', todasDuplasCat);
                    }
                    if (todosJogosCat.length > 0) {
                        await bulkInsert('torneiosfpp_matches', todosJogosCat);
                    }

                } catch (catError) {
                    console.error(`      ❌ Falha na categoria ${cat.sigla}:`, catError.message);
                }
            }

            console.log(`   ✅ Extração concluída para ${torneio.nome}.`);
            totalSucesso++;

        } catch (e) {
            console.error(`   ❌ Falha ao processar o torneio ${torneio.nome}:`, e.message);
            totalErros++;
            // Pequeno intervalo de segurança caso haja instabilidade de rede
            await delay(2000);
        } finally {
            if (page) {
                await page.close().catch(() => {});
            }
        }
    }

    await browser.close().catch(() => {});

    console.log("\n=================================");
    console.log("📊 Resumo da Extração de Torneios");
    console.log("=================================");
    console.log(`✅ Torneios extraídos com sucesso: ${totalSucesso}`);
    console.log(`⚠️ Torneios sem quadros publicados: ${totalSemQuadros}`);
    console.log(`❌ Torneios com falhas: ${totalErros}`);
    console.log(`📋 Total de torneios analisados: ${torneios.length}`);
    console.log("🏁 Processo finalizado!");
})();