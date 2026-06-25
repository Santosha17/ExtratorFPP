require('dotenv').config({ path: '../.env' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
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
    
    const page = await browser.newPage();
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

        try {
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
                    
                    // Encontrar a tabela relacionada (normalmente no mesmo painel)
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
                            licenca = parseInt(urlPerfil.split('id=')[1], 10);
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
                            torneios: []
                        };
                    }).filter(Boolean);
                }, cat.nome);
                
                dadosExtraidos.push(...pageData);
            } else {
                console.log(`Buscando ranking completo...`);
                // Clica no Ver Mais contornando o strict mode
                await page.addScriptTag({
                    content: `
                        setTimeout(function() {
                            var btn = document.querySelector('${btnSelector}');
                            if (btn) btn.click();
                        }, 10);
                    `
                });

                // Espera a tabela detalhada aparecer
                await page.waitForFunction(() => {
                    return document.querySelector('table.team-roster-table') !== null;
                }, { timeout: 30000 });

                // Espera o AJAX terminar
                await page.waitForFunction(() => {
                    return Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack() === false;
                });

                let hasNextPage = true;
                let currentPage = 1;

                while (hasNextPage) {
                    console.log(`   📄 Lendo página ${currentPage}...`);
                    
                    const pageData = await page.evaluate(() => {
                        const table = document.querySelectorAll('table.team-roster-table')[0];
                        const rows = Array.from(table.querySelectorAll('tbody tr'));
                        return rows.map(tr => {
                            const tds = tr.querySelectorAll('td');
                            if (tds.length >= 5) {
                                return {
                                    posicao: tds[0].innerText.trim(),
                                    variacao: tds[1] ? tds[1].innerText.trim() : null,
                                    licenca: parseInt(tds[2].innerText.trim(), 10),
                                    nome: tds[3].innerText.trim(),
                                    pontos: tds[4].innerText.trim(),
                                    clube: tds.length > 5 ? tds[5].innerText.trim() : null,
                                    nivel: tds.length > 6 ? tds[6].innerText.trim() : null,
                                    escalao: tds.length > 7 ? tds[7].innerText.trim() : null,
                                    qtd_torneios: tds.length > 8 ? parseInt(tds[8].innerText.trim(), 10) : 0,
                                    torneios: []
                                };
                            }
                            return null;
                        }).filter(Boolean);
                    });

                    // Loop para clicar em "Ver Pontos" de cada jogador nesta página
                    const rowsCount = pageData.length;
                    for (let i = 0; i < rowsCount; i++) {
                        await page.addScriptTag({
                            content: `
                                setTimeout(function() {
                                    var table = document.querySelector('table.team-roster-table');
                                    if (table) {
                                        var rows = table.querySelectorAll('tbody tr');
                                        if (rows[${i}]) {
                                            var btn = rows[${i}].querySelector('input[value="Ver Pontos"]');
                                            if (btn) btn.click();
                                        }
                                    }
                                }, 10);
                            `
                        });
                        
                        try {
                            await page.waitForFunction(() => {
                                return Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack() === false;
                            }, { timeout: 15000 });
                            await new Promise(r => setTimeout(r, 500)); // Animação do modal
                            
                            const torneiosData = await page.evaluate(() => {
                                // Procurar a tabela dentro de um painel ou modal de pontos
                                const tables = document.querySelectorAll('table');
                                // A tabela de pontos costuma ser a última adicionada ao DOM ou estar num panel
                                let targetTable = tables.length > 1 ? tables[tables.length - 1] : null;
                                // Verificar se é a tabela de torneios olhando para o header ou conteudo
                                if (targetTable && targetTable.innerText.includes('Pontos')) {
                                   // ok
                                }
                                
                                if (!targetTable) return [];
                                
                                const trs = Array.from(targetTable.querySelectorAll('tbody tr'));
                                return trs.map(tr => {
                                    const tds = tr.querySelectorAll('td');
                                    if(tds.length >= 5) {
                                        return {
                                            nome_torneio: tds[0].innerText.trim(),
                                            escalao_torneio: tds[1].innerText.trim(),
                                            resultado: tds[2].innerText.trim(),
                                            pontos: tds[3].innerText.trim(),
                                            data_torneio: tds[4].innerText.trim()
                                        };
                                    }
                                    return null;
                                }).filter(Boolean);
                            });
                            
                            pageData[i].torneios = torneiosData;
                            
                            // Tentar fechar o modal/popup de pontos para não acumular
                            await page.addScriptTag({
                                content: `
                                    setTimeout(function() {
                                        var closeBtn = document.querySelector('[data-dismiss="modal"], .close, .RadWindow .rwCloseButton');
                                        if (closeBtn) closeBtn.click();
                                    }, 10);
                                `
                            });
                            await new Promise(r => setTimeout(r, 200));
                        } catch(e) {
                            console.log(`      ⚠️ Timeout/Erro ao ler pontos do jogador ${pageData[i].nome}. Continuar...`);
                        }
                    }

                    dadosExtraidos.push(...pageData);

                    // Pega a licença do primeiro jogador para garantir que a página mudou
                    const firstLicence = pageData.length > 0 ? pageData[0].licenca : null;

                    // Verifica se há próxima página e clica
                    const hasNextLink = await page.evaluate((pageToFind) => {
                        const pagerSpans = document.querySelectorAll('span[id*="DataPager_ranking_players"]');
                        if (pagerSpans.length === 0) return false;
                        
                        const pager = pagerSpans[0];
                        const links = Array.from(pager.querySelectorAll('a'));
                        let nextLink = links.find(a => a.innerText.trim() === String(pageToFind));
                        
                        if (!nextLink) {
                            const children = Array.from(pager.children);
                            const activeIdx = children.findIndex(el => el.classList.contains('active'));
                            const forwardDot = children.find((el, idx) => idx > activeIdx && el.innerText && el.innerText.trim() === '...');
                            if (forwardDot) {
                                nextLink = forwardDot;
                            }
                        }
                        return nextLink !== undefined;
                    }, currentPage + 1);

                    if (hasNextLink) {
                        await page.addScriptTag({
                            content: `
                                setTimeout(function() {
                                    var pagerSpans = document.querySelectorAll('span[id*="DataPager_ranking_players"]');
                                    if (pagerSpans.length > 0) {
                                        var pager = pagerSpans[0];
                                        var links = Array.from(pager.querySelectorAll('a'));
                                        var nextLink = links.find(a => a.innerText.trim() === String(${currentPage + 1}));
                                        if (!nextLink) {
                                            var children = Array.from(pager.children);
                                            var activeIdx = children.findIndex(el => el.classList.contains('active'));
                                            var forwardDot = children.find((el, idx) => idx > activeIdx && el.innerText && el.innerText.trim() === '...');
                                            if (forwardDot) {
                                                nextLink = forwardDot;
                                            }
                                        }
                                        if (nextLink) nextLink.click();
                                    }
                                }, 10);
                            `
                        });

                        try {
                            // Espera que a tabela atualize (primeira licença muda) ou chegue ao fim do carregamento
                            await page.waitForFunction((oldLicence) => {
                                const table = document.querySelectorAll('table.team-roster-table')[0];
                                if (!table) return false;
                                const tr = table.querySelector('tbody tr');
                                if (!tr) return false;
                                const tds = tr.querySelectorAll('td');
                                if (tds.length < 5) return false;
                                const currentLicence = parseInt(tds[2].innerText.trim(), 10);
                                return currentLicence !== oldLicence && Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack() === false;
                            }, { timeout: 20000 }, firstLicence);
                        } catch(e) {
                            console.log(`      ⚠️ Timeout ao esperar página ${currentPage + 1}.`);
                            hasNextPage = false;
                            continue;
                        }

                        currentPage++;
                    } else {
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
                            data_atualizacao: dataExtracao
                        });
                    }
                }
                delete f._torneios; // Remove extra property before upsert
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
            
            if (torneiosParaInserir.length > 0) {
                console.log(`✅ Foram extraídos ${torneiosParaInserir.length} torneios em ${cat.nome}. A guardar no Supabase...`);
                const { error: errTorneios } = await supabase
                    .from('rankingsfpp_torneios')
                    .upsert(torneiosParaInserir, { onConflict: 'licenca, nome_torneio, escalao_torneio, data_atualizacao' });

                if (errTorneios) {
                    console.error(`❌ Erro ao guardar torneios de ${cat.nome} no Supabase:`, errTorneios);
                } else {
                    console.log(`💾 Sucesso ao guardar ${torneiosParaInserir.length} torneios!`);
                }
            }

        } catch (err) {
            console.error(`❌ Erro geral ao extrair a categoria ${cat.nome}:`, err.message);
        }
    }

    console.log(`\n🎉 Extração concluída com sucesso!`);
    await browser.close();
})();
