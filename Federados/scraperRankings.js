require('dotenv').config({ path: '../.env' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const supabaseUrl = process.env.SUPABASE_URL_SN_LIGA;
const supabaseServiceKey = process.env.SUPABASE_KEY_SN_LIGA;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Credenciais do Supabase não encontradas.");
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
    // Usamos o plugin Stealth para o Cloudflare não detetar que somos um bot
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }); 
    
    const urlFpp = 'https://tour.tiesports.com/fpp/weekly_rankings';
    
    const categoriasParaExtrair = [
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

    for (const cat of categoriasParaExtrair) {
        console.log(`\n⏳ A extrair ranking completo para: ${cat.nome}...`);
        
        let page;
        try {
            page = await browser.newPage();
            await page.goto(urlFpp, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForFunction(() => typeof Sys !== 'undefined' && Sys.WebForms && Sys.WebForms.PageRequestManager);

            const btnSelector = `a[href*="${cat.target}"]`;
            const btnExists = await page.$(btnSelector);
            const dadosExtraidos = [];
            const dataExtracao = new Date().toISOString().split('T')[0];

            if (!btnExists) {
                console.log(`⚠️ Botão 'Ver mais' não encontrado para ${cat.nome}. Lendo diretamente dos top 10...`);
                // Lemos diretamente da tabela inicial
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
                console.log(`Buscando ranking completo...`);
                
                // Clica no "Ver mais" e aguarda o endRequest do WebForms
                await page.evaluate((sel) => {
                    return new Promise((resolve) => {
                        const prm = Sys.WebForms.PageRequestManager.getInstance();
                        const handler = (sender, args) => {
                            prm.remove_endRequest(handler);
                            resolve();
                        };
                        prm.add_endRequest(handler);
                        const btn = document.querySelector(sel);
                        if (btn) btn.click();
                        else resolve();
                    });
                }, btnSelector);

                await page.waitForFunction(() => document.querySelector('table.team-roster-table') !== null, { timeout: 30000 });

                let hasNextPage = true;

                while (hasNextPage) {
                    const activePageNum = await page.evaluate(() => {
                        const activeEl = document.querySelector('span[id*="DataPager_ranking_players"] .active');
                        return activeEl ? parseInt(activeEl.innerText.trim(), 10) : 1;
                    });

                    console.log(`   📄 Lendo página ${activePageNum}...`);
                    
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

                    // Loop para clicar em "Ver Pontos" de cada jogador nesta página
                    const rowsCount = pageData.length;
                    for (let i = 0; i < rowsCount; i++) {
                        const player = pageData[i];
                        if (!player.hasPointsBtn) continue;

                        try {
                            // Clica em "Ver Pontos" e aguarda fim do PostBack WebForms
                            await page.evaluate((rowIndex) => {
                                return new Promise((resolve) => {
                                    const prm = Sys.WebForms.PageRequestManager.getInstance();
                                    const handler = (sender, args) => {
                                        prm.remove_endRequest(handler);
                                        resolve();
                                    };
                                    prm.add_endRequest(handler);
                                    const table = document.querySelector('table.team-roster-table');
                                    const rows = table ? table.querySelectorAll('tbody tr') : [];
                                    if (rows[rowIndex]) {
                                        const btn = rows[rowIndex].querySelector('input[value="Ver Pontos"]');
                                        if (btn) btn.click();
                                        else resolve();
                                    } else {
                                        resolve();
                                    }
                                });
                            }, player.rowIndex);

                            await new Promise(r => setTimeout(r, 150)); // Animação do modal
                            
                            const playerExtraInfo = await page.evaluate(() => {
                                const locationNode = document.querySelector('[id*="lbl_ranking_points_player_from"]');
                                const handNode = document.querySelector('[id*="lbl_ranking_points_player_plays"]');
                                const torneios = [];
                                
                                // Tab 1: Contabilizados
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
                                
                                // Tab 2: Não contabilizados
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
                            
                            // Fechar o modal de pontos
                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('[data-dismiss="modal"], .close, .RadWindow .rwCloseButton');
                                if (closeBtn) closeBtn.click();
                            });
                            await new Promise(r => setTimeout(r, 100));
                        } catch(e) {
                            console.log(`      ⚠️ Timeout/Erro ao ler pontos do jogador ${player.nome}. Continuar...`);
                        }
                    }

                    dadosExtraidos.push(...pageData);

                    // Paginação para a próxima página
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

                        if (!linkToClick) {
                            return { canNavigate: false };
                        }

                        return new Promise((resolve) => {
                            const prm = Sys.WebForms.PageRequestManager.getInstance();
                            const handler = (sender, args) => {
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

            // Evitar duplicações caso haja falha na paginação
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
                delete f._torneios; // Remove extra property before upsert
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

            console.log(`✅ Foram extraídos ${unicos.length} jogadores únicos em ${cat.nome}. A guardar no Supabase...`);

            if (unicos.length > 0) {
                const { error } = await supabase
                    .from('rankingsfpp')
                    .upsert(unicos, { onConflict: 'licenca, categoria, data_atualizacao' });

                if (error) {
                    console.error(`❌ Erro ao guardar ${cat.nome} no Supabase:`, error);
                } else {
                    console.log(`💾 Sucesso ao guardar ${cat.nome}!`);
                }
            }
            
            if (torneiosUnicos.length > 0) {
                console.log(`✅ Foram extraídos ${torneiosUnicos.length} torneios únicos em ${cat.nome}. A guardar no Supabase...`);
                const { error: errTorneios } = await supabase
                    .from('rankingsfpp_torneios')
                    .upsert(torneiosUnicos, { onConflict: 'licenca, nome_torneio, escalao_torneio, data_atualizacao' });

                if (errTorneios) {
                    console.error(`❌ Erro ao guardar torneios de ${cat.nome} no Supabase:`, errTorneios);
                } else {
                    console.log(`💾 Sucesso ao guardar ${torneiosUnicos.length} torneios!`);
                }
            }

        } catch (err) {
            console.error(`❌ Erro geral ao extrair a categoria ${cat.nome}:`, err.message);
        } finally {
            if (page) {
                await page.close().catch(e => console.log('Erro ao fechar página:', e.message));
            }
        }
    }

    console.log(`\n🎉 Extração concluída com sucesso!`);
    await browser.close();
})();
