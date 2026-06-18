require('dotenv').config({ path: '../.env' }); // Vai buscar o teu .env à pasta raiz
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = globalThis.fetch || require('node-fetch');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

const headersSupabase = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
};

// Apaga os dados velhos do torneio antes de inserir os novos para não haver duplicados
async function limparDadosAntigos(torneio_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp_duplas?torneio_id=eq.${torneio_id}`, { method: 'DELETE', headers: headersSupabase });
    await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches?torneio_id=eq.${torneio_id}`, { method: 'DELETE', headers: headersSupabase });
}

async function bulkInsert(tableName, dataArray) {
    if (dataArray.length === 0) return;
    await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
        method: 'POST',
        headers: headersSupabase,
        body: JSON.stringify(dataArray)
    });
}

(async () => {
    console.log("📥 A contactar Supabase para obter a lista de torneios...");

    // Vamos buscar os torneios. Podes adicionar um ?limit=5 no URL para testar apenas os primeiros 5!
    const response = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?select=fpp_id,nome,url_tiepadel&url_tiepadel=not.is.null`, {
        headers: headersSupabase
    });
    const torneios = await response.json();

    console.log(`🔍 Encontrados ${torneios.length} torneios para raspar.`);

    const browser = await puppeteer.launch({ headless: true }); // Muda para false se quiseres ver a magia a acontecer no ecrã!
    const page = await browser.newPage();

    // Otimizar o Puppeteer para carregar páginas mais rápido (ignora imagens e CSS desnecessário)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
    });

    for (const torneio of torneios) {
        console.log(`\n🎾 A extrair: ${torneio.nome} (ID: ${torneio.fpp_id})`);

        try {
            await limparDadosAntigos(torneio.fpp_id);
            await page.goto(torneio.url_tiepadel + "/Draws", { waitUntil: 'networkidle2' });

            // Verificar se o torneio tem quadros (dropdown)
            const temQuadros = await page.evaluate(() => document.querySelector('select[id$="drop_tournaments"]') !== null);
            if (!temQuadros) {
                console.log("   ⚠️ Quadros ainda não publicados.");
                continue;
            }

            // Apanhar todas as categorias (Ex: M1, M2, F3)
            const categorias = await page.evaluate(() => {
                const opts = document.querySelectorAll('select[id$="drop_tournaments"] option');
                return Array.from(opts).slice(1).map(o => ({ value: o.value, sigla: o.innerText.trim() }));
            });

            for (const cat of categorias) {
                console.log(`   ⏳ Categoria: ${cat.sigla}`);

                try {
                    // 1. O TRUQUE VITAL: Recarregar a página base limpa antes de cada categoria!
                    await page.goto(torneio.url_tiepadel + "/Draws", { waitUntil: 'networkidle2', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 1000));

                    // 2. Verificar se o dropdown existe
                    const dropdownExiste = await page.evaluate(() => document.querySelector('select[id$="drop_tournaments"]') !== null);
                    if (!dropdownExiste) {
                        console.log("      ⚠️ Dropdown desapareceu. A saltar...");
                        continue;
                    }

                    // 3. Selecionar a categoria e À ESPERA DA NAVEGAÇÃO
                    const navPromiseCat = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
                    await page.select('select[id$="drop_tournaments"]', cat.value);
                    await navPromiseCat;
                    await new Promise(r => setTimeout(r, 1500)); // Margem extra de segurança

                    // Apanhar as Fases (Ex: Grupos, Qualificação, Main)
                    const fases = await page.evaluate(() => {
                        const links = document.querySelectorAll('a[id*="repeater_pages"]');
                        if (links.length === 0) return [{ id: null, nome: 'Principal' }];
                        return Array.from(links).map(l => ({ id: l.id, nome: l.innerText.trim() }));
                    });

                    let todasDuplasCat = [];
                    let todosJogosCat = [];

                    for (const fase of fases) {
                        // Se houver botões de fase, clica neles e ESPERA
                        if (fase.id) {
                            const navPromiseFase = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
                            await page.click(`#${fase.id}`);
                            await navPromiseFase;
                            await new Promise(r => setTimeout(r, 1500)); // Margem extra de segurança
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
                                            categoria: siglaCat, fase: nomeFase,
                                            cabeca_serie: tr.querySelector('span[id*="_lbl_dsc_"]')?.innerText.trim() || '',
                                            nome_a: p1.innerText.trim(), licenca_a: getInfo(p1, 'lic'), pontos_a: getInfo(p1, 'ranking'),
                                            nome_b: p2.innerText.trim(), licenca_b: getInfo(p2, 'lic'), pontos_b: getInfo(p2, 'ranking')
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
                                                categoria: siglaCat, fase: nomeFase, cabeca_serie: '',
                                                nome_a: nomes[0].trim(), licenca_a: 'N/A', pontos_a: '0',
                                                nome_b: nomes[1].trim(), licenca_b: 'N/A', pontos_b: '0'
                                            });
                                        }
                                    }
                                }
                            });

                            // 3. Extrair Jogos, Resultados, Datas/Horas e Rondas
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
                                        let ronda = 'Eliminatórias';

                                        const parentTd = scoreEl.closest('td');
                                        if (parentTd) {
                                            // Extração da Data
                                            const prevTd = parentTd.previousElementSibling;
                                            if (prevTd) {
                                                const dateSpan = prevTd.querySelector('.date');
                                                if (dateSpan) dataHoraCampo = dateSpan.innerText.trim();
                                            }
                                            if (!dataHoraCampo && parentTd.parentElement) {
                                                const rowDateSpan = parentTd.parentElement.querySelector('.date');
                                                if (rowDateSpan) dataHoraCampo = rowDateSpan.innerText.trim();
                                            }

                                            // Extração da RONDA (Hack de Coordenadas Visuais)
                                            const table = parentTd.closest('table.new_draw');
                                            if (table) {
                                                const ths = Array.from(table.querySelectorAll('thead th'));
                                                if (ths.length > 0) {
                                                    const tdRect = parentTd.getBoundingClientRect();
                                                    let minDiff = Infinity;
                                                    let closestTh = ths[0];

                                                    ths.forEach(th => {
                                                        const thRect = th.getBoundingClientRect();
                                                        const diff = Math.abs(thRect.left - tdRect.left);
                                                        if (diff < minDiff) {
                                                            minDiff = diff;
                                                            closestTh = th;
                                                        }
                                                    });
                                                    ronda = closestTh.innerText.trim() || 'Quadro Principal';
                                                }
                                            } else {
                                                ronda = 'Fase de Grupos';
                                            }
                                        }

                                        jogos.push({
                                            categoria: siglaCat,
                                            fase: nomeFase,
                                            ronda: ronda,
                                            equipa_a: equipaA,
                                            equipa_b: equipaB,
                                            resultado: scoreEl.innerText.trim() || 'Pendente',
                                            data_hora_campo: dataHoraCampo
                                        });
                                    }
                                }
                            });

                            return { duplas, jogos };
                        }, cat.sigla, fase.nome);
                        // ====== FIM DA EXTRAÇÃO ======

                        extraidos.duplas.forEach(d => { d.torneio_id = torneio.fpp_id; todasDuplasCat.push(d); });
                        extraidos.jogos.forEach(j => { j.torneio_id = torneio.fpp_id; todosJogosCat.push(j); });
                    }

                    // Gravar no Supabase (Por Categoria)
                    if (todasDuplasCat.length > 0) await bulkInsert('torneiosfpp_duplas', todasDuplasCat);
                    if (todosJogosCat.length > 0) await bulkInsert('torneiosfpp_matches', todosJogosCat);

                } catch (catError) {
                    console.error(`      ❌ Falha na categoria ${cat.sigla}:`, catError.message);
                }
            }
            console.log(`   ✅ Extração concluída para ${torneio.nome}.`);

        } catch (e) {
            console.error(`   ❌ Falha ao processar o torneio ${torneio.nome}:`, e.message);
        }
    }

    await browser.close();
    console.log("\n🚀 Todos os Quadros extraídos com sucesso!");
})();