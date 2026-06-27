const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

// Ficheiro Excel de entrada com os jogadores do CPC
const EXCEL_PATH = path.join(__dirname, 'Excel_nomes_fppid_equipas_ligaCPC.xlsx');

// 1. Carregar jogadores do Excel
function carregarJogadoresCPC() {
    console.log("📥 A ler base de dados de atletas (Excel)...");
    try {
        const workbook = XLSX.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        // Transformar num Map para procura rápida pelo FPP ID
        const mapaJogadores = new Map();
        data.forEach(row => {
            if (row['FPP ID']) {
                mapaJogadores.set(String(row['FPP ID']).trim(), {
                    nome: row['Nomes'],
                    fppId: String(row['FPP ID']).trim(),
                    equipa: row['Nome da Equipa']
                });
            }
        });
        console.log(`✅ Foram carregados ${mapaJogadores.size} atletas do Excel.`);
        return mapaJogadores;
    } catch (err) {
        console.error("❌ Erro ao ler Excel:", err.message);
        process.exit(1);
    }
}

// Extrair ID do torneio do link (se necessário)
function getTournamentId(url) {
    const match = url.match(/Tournaments\/([a-zA-Z0-9\-]+)/i);
    return match ? match[1] : null;
}

// Script principal
(async () => {
    console.log("🚀 A iniciar o Extrator de Resultados CPC...");
    const jogadoresCPC = carregarJogadoresCPC();
    const resultadosEncontrados = [];

    const browser = await puppeteer.launch({
        headless: false, // Define para false para contornar o bloqueio da Cloudflare
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const resultadosTxt = [];

    try {
        console.log("🌍 A aceder ao calendário da FPP (Pode pedir para verificares que não és um robô)...");
        await page.goto('https://tour.tiesports.com/fpp/calendar_(tournaments)', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Espera extra para dar tempo de passares o Cloudflare se aparecer, e para o TieSports carregar a lista
        console.log("⏳ À espera que a lista de torneios carregue (15 segundos)...");
        await new Promise(r => setTimeout(r, 15000));

        // Extrair todos os links para debug e procurar torneios
        const torneios = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const matches = [];
            const debugAllLinks = [];
            
            links.forEach(a => {
                const href = a.href || '';
                const texto = a.innerText ? a.innerText.trim() : '';
                
                debugAllLinks.push({ texto: texto, href: href });
                
                // Case-insensitive check for 'tournament' and ignore "Liga Mudum 2026"
                if (href.toLowerCase().includes('tournament') && texto.length > 0) {
                    if (!texto.toLowerCase().includes('liga mudum 2026')) {
                        if (!matches.some(m => m.url === href)) {
                            matches.push({ nome: texto, url: href });
                        }
                    }
                }
            });
            
            // Retornar também a lista toda para caso dê erro guardarmos no disco
            return { matches, debugAllLinks };
        });

        console.log(`🔎 Foram encontrados ${torneios.matches.length} potenciais torneios/links.`);

        for (const torneio of torneios.matches) {
            // Ignorar Liga Mudum explicitamente pelo nome ou link do calendário
            if (torneio.nome.toLowerCase().includes('liga mudum') || torneio.nome.toLowerCase().includes('fase regular') || torneio.url.includes('calendar_(tournaments)')) {
                console.log(`   ⏭️ A ignorar torneio não válido: ${torneio.nome}`);
                continue;
            }

            console.log(`\n==================================================`);
            console.log(`🎾 A analisar torneio: ${torneio.nome}`);
            console.log(`🔗 Link: ${torneio.url}`);
            
            try {
                // Ir para a página principal de Jogadores/Inscritos
                let urlInscritos = torneio.url;
                if (!urlInscritos.includes('/Players') && !urlInscritos.includes('/Draws')) {
                    urlInscritos = urlInscritos + "/Players";
                } else {
                    urlInscritos = urlInscritos.replace('/Draws', '/Players');
                }

                console.log(`   ⏳ A carregar lista de jogadores...`);
                await page.goto(urlInscritos, { waitUntil: 'domcontentloaded', timeout: 40000 });
                await new Promise(r => setTimeout(r, 6000));

                // Procurar pelos nomes dos jogadores do Excel nas linhas da tabela de TODAS as páginas
                let allRows = [];
                let hasNextPage = true;
                let numPaginasLidas = 0;

                while (hasNextPage && numPaginasLidas < 60) {
                    numPaginasLidas++;
                    try {
                        const linhasDestaPagina = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText);
                        });
                        allRows.push(...linhasDestaPagina);
                    } catch (e) {
                        console.log(`   ⚠️ Erro ao ler texto da página ${numPaginasLidas}, a tentar de novo...`);
                        await new Promise(r => setTimeout(r, 3000));
                        const linhasRetry = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText);
                        });
                        allRows.push(...linhasRetry);
                    }

                    // Tentar encontrar botão "Próxima Página"
                    hasNextPage = await page.evaluate(() => {
                        const nextBtns = Array.from(document.querySelectorAll('.rgPageNext, .k-i-arrow-60-right, .k-pager-nav[title="Next"], a[aria-label="Next"]'));
                        
                        for (const btn of nextBtns) {
                            const isDisabled = btn.disabled || btn.classList.contains('rgPageNextDisabled') || btn.classList.contains('k-state-disabled') || btn.classList.contains('disabled');
                            const onclickAttr = btn.getAttribute('onclick') || '';
                            
                            if (!isDisabled && !onclickAttr.includes('return false')) {
                                btn.click();
                                return true;
                            }
                        }
                        
                        const textLinks = Array.from(document.querySelectorAll('a')).filter(a => a.innerText.trim() === 'Next' || a.innerText.trim() === 'Seguinte');
                        for (const link of textLinks) {
                             if (!link.classList.contains('disabled') && !link.classList.contains('k-state-disabled')) {
                                 link.click();
                                 return true;
                             }
                        }
                        return false;
                    });

                    if (hasNextPage) {
                        console.log(`   ➡️ A carregar página ${numPaginasLidas + 1} de jogadores...`);
                        await new Promise(r => setTimeout(r, 4000)); // Esperar que o Telerik atualize a grelha
                    }
                }
                
                const jogadoresEncontradosNesteTorneio = [];
                const normalize = (str) => str.toLowerCase().replace(/\s+/g, '');
                
                let checkClubePresente = false;
                for (const row of allRows) {
                    if (normalize(row).includes('clubepadeldascaldas')) {
                        checkClubePresente = true;
                        break;
                    }
                }
                
                for (const [fpp, info] of jogadoresCPC.entries()) {
                    let playerFoundInRowWithClub = false;
                    for (const row of allRows) {
                        const rowNormalized = normalize(row);
                        const nameNormalized = normalize(info.nome);
                        // O nome tem de estar na mesma linha que o ClubePadeldasCaldas para evitar homónimos
                        if (rowNormalized.includes(nameNormalized) && rowNormalized.includes('clubepadeldascaldas')) {
                            playerFoundInRowWithClub = true;
                            break;
                        }
                    }
                    if (playerFoundInRowWithClub) {
                        jogadoresEncontradosNesteTorneio.push(info);
                    }
                }

                // Check extra usando a dica do utilizador
                if (jogadoresEncontradosNesteTorneio.length === 0 && checkClubePresente) {
                     console.log(`   ⚠️ Aviso: Encontrei atletas do ClubePadeldasCaldas, mas nenhum nome coincidiu com o teu Excel (pode haver um erro de digitação no nome no Excel ou no site)!`);
                }

                if (jogadoresEncontradosNesteTorneio.length > 0) {
                    const nomesEncontrados = jogadoresEncontradosNesteTorneio.map(j => j.nome).join(', ');
                    console.log(`   🎯 Encontrados ${jogadoresEncontradosNesteTorneio.length} jogadores do Caldas (${nomesEncontrados})! A navegar para os Quadros...`);
                    
                    // Ir para os Quadros/Draws
                    const urlQuadros = urlInscritos.replace('/Players', '/Draws');
                    await page.goto(urlQuadros, { waitUntil: 'domcontentloaded', timeout: 40000 });
                    await new Promise(r => setTimeout(r, 6000));

                    // Procurar dropdown de categorias e iterar
                    // Como a FPP usa Telerik ou selects nativos, vamos tentar ler o dropdown
                    const categorias = await page.evaluate(() => {
                        const selects = document.querySelectorAll('select');
                        if (selects.length > 0) {
                            // Pegar no primeiro select (costuma ser o das categorias)
                            const options = Array.from(selects[0].options);
                            return options.map((opt, index) => ({
                                text: opt.innerText.trim(),
                                value: opt.value,
                                index: index,
                                isSelect: true
                            }));
                        }
                        
                        // Se for dropdown div/ul (TieSports novo)
                        const dropdowns = Array.from(document.querySelectorAll('.dropdown-menu a, ul.rtsUL li'));
                        if (dropdowns.length > 0) {
                            return dropdowns.map((el, index) => ({
                                text: el.innerText.trim(),
                                index: index,
                                isSelect: false
                            }));
                        }
                        return [];
                    });

                    if (categorias.length === 0) {
                         console.log(`   ⚠️ Não encontrei o dropdown de categorias nos quadros.`);
                         // Grava um debug HTML para investigarmos se falhar
                         const html = await page.content();
                         require('fs').writeFileSync('debug_quadros.html', html);
                    } else {
                        console.log(`   📂 Encontradas ${categorias.length} categorias. A analisar uma a uma...`);
                        
                        for (const cat of categorias) {
                            if (!cat.text || cat.text.length === 0) continue;
                            if (cat.text.toLowerCase().includes('escolha') || cat.text.toLowerCase().includes('selec') || cat.text.toLowerCase().includes('choose')) continue;
                            
                            // A pedido do utilizador: voltar à página base de quadros para "limpar" o estado do dropdown
                            console.log(`      🔄 A recarregar os quadros para a categoria: ${cat.text}...`);
                            try {
                                await page.goto(urlQuadros, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await new Promise(r => setTimeout(r, 4000)); // Esperar o carregamento base
                            } catch (e) {
                                console.log(`      ⚠️ Erro ao recarregar a página base dos quadros.`);
                            }

                            // Tentar selecionar a categoria com retentativas (útil se o site estiver a carregar via Ajax)
                            let conseguiuSelecionar = false;
                            for (let retry = 0; retry < 3; retry++) {
                                conseguiuSelecionar = await page.evaluate(async (catText) => {
                                    
                                    // 1. Tentar selecionar nativamente (select)
                                    const selects = document.querySelectorAll('select');
                                    let targetSelect = null;
                                    
                                    // Encontrar um select que tenha esta opção
                                    for (const s of selects) {
                                        const opts = Array.from(s.options);
                                        if (opts.some(o => o.innerText.trim() === catText)) {
                                            targetSelect = s;
                                            break;
                                        }
                                    }

                                    if (targetSelect) {
                                        const opts = Array.from(targetSelect.options);
                                        const targetOptIndex = opts.findIndex(o => o.innerText.trim() === catText);
                                        if (targetOptIndex !== -1 && targetSelect.selectedIndex !== targetOptIndex) {
                                            targetSelect.selectedIndex = targetOptIndex;
                                            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
                                            return true;
                                        } else if (targetOptIndex !== -1 && targetSelect.selectedIndex === targetOptIndex) {
                                            return true; // Já está selecionado
                                        }
                                    }

                                    // 2. Tentar dropdowns complexos (Telerik, Kendo, etc)
                                    // Clicar na seta para expandir se existir
                                    const arrow = document.querySelector('.rcbArrowCell, .rcbInput, .k-select, .k-dropdown-wrap');
                                    if (arrow) {
                                        arrow.click();
                                        await new Promise(res => setTimeout(res, 800)); // Esperar abrir
                                    }

                                    const dropdowns = Array.from(document.querySelectorAll('.dropdown-menu a, ul.rtsUL li, .rcbList li, .k-list li'));
                                    const targetItem = dropdowns.find(el => el.innerText.trim() === catText);
                                    
                                    if (targetItem) {
                                        targetItem.click();
                                        return true;
                                    }

                                    return false;
                                }, cat.text);

                                if (conseguiuSelecionar) break;
                                
                                // Esperar um bocado antes do retry porque a grelha pode estar a atualizar
                                await new Promise(r => setTimeout(r, 3000));
                            }

                            if (!conseguiuSelecionar) {
                                console.log(`      ⚠️ Falha ao selecionar a categoria ${cat.text}`);
                                continue;
                            }

                            // Esperar que o quadro carregue e que a animação Ajax do Telerik termine
                            console.log(`      ⏳ A analisar quadro base: ${cat.text}...`);
                            await new Promise(r => setTimeout(r, 6000));
                            
                            // Função auxiliar para analisar o DOM e guardar os resultados do sub-quadro atual
                            const analisarDOMQuadro = async (nomeSubQuadro) => {
                                let qText = "";
                                try {
                                    qText = await page.evaluate(() => document.body.innerText);
                                } catch(e) {
                                    return; // Se falhar, ignora este subquadro
                                }
                                
                                for (const jog of jogadoresEncontradosNesteTorneio) {
                                    if (qText.includes(jog.nome)) {
                                        // Tentar descobrir a ronda e o parceiro no DOM atual
                                        const dadosQuadro = await page.evaluate((nome) => {
                                            const pageText = document.body.innerText;
                                            const safeNome = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                            const playerMatches = pageText.match(new RegExp(safeNome, 'g'));
                                            const P = playerMatches ? playerMatches.length : 0;
                                            
                                            // Tentar descobrir o parceiro
                                            let parceiro = "Desconhecido";
                                            const playerEls = Array.from(document.querySelectorAll('div, span, td, th, a')).filter(e => e.innerText && e.innerText.trim() === nome);
                                            
                                            if (playerEls.length > 0) {
                                                const startEl = playerEls[0];
                                                
                                                // Heurística 1: Pela mesma linha da tabela
                                                const container = startEl.closest('tr, .team, .rtbItem');
                                                if (container) {
                                                    const nomesNoContainer = Array.from(container.querySelectorAll('span, a, div, td'))
                                                        .map(e => e.innerText ? e.innerText.trim() : '')
                                                        .filter(t => t.length > 4 && t.length < 35 && t.includes(' ') && !/\d/.test(t) && t !== nome && !['BYE', 'VENCEDOR', 'GRUPO'].includes(t.toUpperCase()));
                                                    if (nomesNoContainer.length > 0) parceiro = nomesNoContainer[0];
                                                }
                                                
                                                // Heurística 2: Pela ordem visual das linhas de texto (acima ou abaixo)
                                                if (parceiro === "Desconhecido") {
                                                    const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
                                                    const idx = lines.findIndex(l => l === nome);
                                                    if (idx !== -1) {
                                                        const prev = lines[idx - 1] || '';
                                                        const next = lines[idx + 1] || '';
                                                        const isName = (str) => str.includes(' ') && str.length > 4 && str.length < 35 && !/\d/.test(str) && !['BYE', 'VENCEDOR', 'GRUPO', 'FASE'].includes(str.toUpperCase());
                                                        
                                                        if (isName(next)) parceiro = next;
                                                        else if (isName(prev)) parceiro = prev;
                                                    }
                                                }
                                            }

                                            if (P === 0) return { ronda: "Não apurado/Não presente neste sub-quadro", parceiro };
                                            
                                            const isGroup = pageText.toUpperCase().includes('GRUPO') && !pageText.toUpperCase().includes('FASE FINAL');
                                            if (isGroup) return { ronda: `Fase de Grupos (Jogou ${P} partidas)`, parceiro };

                                            let M = document.querySelectorAll('.round-column').length;
                                            
                                            if (M === 0) {
                                                const nameElements = document.querySelectorAll('span, td, div, a');
                                                const uniqueNames = new Set();
                                                nameElements.forEach(el => {
                                                    const t = el.innerText.trim();
                                                    if (t.length > 5 && t.length < 35 && t.includes(' ')) uniqueNames.add(t);
                                                });
                                                
                                                let maxOccurrences = 0;
                                                for (const n of uniqueNames) {
                                                    const safeN = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                                    const m = pageText.match(new RegExp(safeN, 'g'));
                                                    if (m && m.length > maxOccurrences) maxOccurrences = m.length;
                                                }
                                                M = maxOccurrences;
                                            }
                                            
                                            if (M < 2) {
                                                if (P === 1) return { ronda: "1º Jogo (Eliminado)", parceiro };
                                                if (P === 2) return { ronda: "Avançou 1 eliminatória", parceiro };
                                                return { ronda: `Avançou até aparecer ${P} vezes`, parceiro };
                                            }
                                            
                                            const diff = M - P;
                                            
                                            if (diff <= 0) return { ronda: "🏆 Vencedor do Torneio!", parceiro };
                                            if (diff === 1) return { ronda: "Final (Finalista)", parceiro };
                                            if (diff === 2) return { ronda: "Meias-Finais", parceiro };
                                            if (diff === 3) return { ronda: "Quartos de final", parceiro };
                                            if (diff === 4) return { ronda: "Oitavos de final", parceiro };
                                            if (diff === 5) return { ronda: "16-avos de final", parceiro };
                                            if (diff === 6) return { ronda: "32-avos de final", parceiro };
                                            if (diff === 7) return { ronda: "64-avos de final", parceiro };
                                            
                                            return { ronda: `Eliminado a ${diff} rondas da final`, parceiro };
                                        }, jog.nome);
                                        
                                        const subQStr = nomeSubQuadro ? `(Sub-Quadro: ${nomeSubQuadro})` : `(Quadro Principal)`;
                                        const resultadoString = `Torneio: ${torneio.nome} | Categoria: ${cat.text} ${subQStr} | Jogador: ${jog.nome} | Parceiro: ${dadosQuadro.parceiro} | FPP: ${jog.fppId} | Ronda/Status: ${dadosQuadro.ronda}`;
                                        
                                        // Evitar duplicados perfeitos
                                        if (!resultadosTxt.includes(resultadoString)) {
                                            console.log(`      -> ${resultadoString}`);
                                            resultadosTxt.push(resultadoString);
                                        }
                                    }
                                }
                            };

                            // Analisar o quadro que carrega por defeito
                            await analisarDOMQuadro('');

                            // -------------------------------------------------------------
                            // Analisar sub-quadros (Fase Final, Grupo A, Grupo B, etc.)
                            // -------------------------------------------------------------
                            const subTabs = await page.evaluate(() => {
                                const tabs = Array.from(document.querySelectorAll('a.rtsLink, a.nav-link, .nav-tabs a, .k-link, .draw-tabs a'));
                                const validos = [];
                                tabs.forEach((tab, index) => {
                                    const txt = tab.innerText.trim().toUpperCase();
                                    const isMainTab = ['QUADRO', 'ENCONTROS', 'JOGADORES', 'INFORMAÇÃO', 'REGULAMENTO', 'EQUIPAS', 'HOME', 'NOTÍCIAS', 'FOTOGRAFIAS'].includes(txt);
                                    const isPlaceholder = txt.includes('ESCOLHA UM') || txt.includes('CHOOSE');
                                    // Se não for uma tab principal nem placeholder, e for pequena, é um subquadro
                                    if (txt.length > 0 && txt.length < 40 && !isMainTab && !isPlaceholder) {
                                        validos.push({ text: tab.innerText.trim(), index: index });
                                    }
                                });
                                return validos;
                            });

                            if (subTabs.length > 1 && subTabs.length < 15) {
                                console.log(`      ➡️ Detetados ${subTabs.length} sub-quadros (Grupos/Fases). A vasculhar um a um...`);
                                for (const sTab of subTabs) {
                                    const clicked = await page.evaluate((idx) => {
                                        const tabs = Array.from(document.querySelectorAll('a.rtsLink, a.nav-link, .nav-tabs a, .k-link, .draw-tabs a'));
                                        const validos = [];
                                        tabs.forEach((tab, index) => {
                                            const txt = tab.innerText.trim().toUpperCase();
                                            const isMainTab = ['QUADRO', 'ENCONTROS', 'JOGADORES', 'INFORMAÇÃO', 'REGULAMENTO', 'EQUIPAS', 'HOME', 'NOTÍCIAS', 'FOTOGRAFIAS'].includes(txt);
                                            const isPlaceholder = txt.includes('ESCOLHA UM') || txt.includes('CHOOSE');
                                            if (txt.length > 0 && txt.length < 40 && !isMainTab && !isPlaceholder) {
                                                validos.push(tab);
                                            }
                                        });
                                        if (validos[idx]) {
                                            validos[idx].click();
                                            return true;
                                        }
                                        return false;
                                    }, subTabs.indexOf(sTab));

                                    if (clicked) {
                                        await new Promise(r => setTimeout(r, 4000)); // Esperar pelo Ajax do subquadro
                                        await analisarDOMQuadro(sTab.text);
                                    }
                                }
                            }

                        }
                    }

                } else {
                    console.log(`   ❌ Nenhum jogador do Caldas detetado aqui.`);
                }

            } catch (err) {
                console.error(`   ⚠️ Erro ao raspar o torneio ${torneio.nome}:`, err.message);
            }
        }

    } catch (err) {
        console.error("❌ Ocorreu um erro no motor principal:", err);
    } finally {
        await browser.close();
    }

    // Gerar ficheiro TXT final
    if (resultadosTxt.length > 0) {
        console.log(`\n📄 A gerar relatório final TXT com ${resultadosTxt.length} resultados...`);
        const dataAtual = new Date().toISOString().split('T')[0];
        const nomeFicheiro = `Resultados_CPC_${dataAtual}.txt`;
        const outputPath = path.join(__dirname, nomeFicheiro);
        
        require('fs').writeFileSync(outputPath, resultadosTxt.join('\n'));
        console.log(`✅ Relatório TXT gravado com sucesso em: ${outputPath}`);
    } else {
        console.log(`\n🤷‍♂️ Não foram encontrados resultados para processar.`);
    }

    console.log("🏁 Execução terminada!");
})();
