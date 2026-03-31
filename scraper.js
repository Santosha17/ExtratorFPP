const puppeteer = require('puppeteer');
const fs = require('fs');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
// ---------------------------------

const URL = "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4B/Matches";

// Função Mágica para Sincronizar com o Supabase
async function sincronizarComSupabase(jogos) {
    console.log(`\n💾 A iniciar sincronização de ${jogos.length} jogos com o Supabase...`);

    let inseridos = 0;
    let atualizados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const jogo of jogos) {
        try {
            // 1. Procurar o ID do encontro principal (matches)
            const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(jogo.equipa_casa)}&away_team=eq.${encodeURIComponent(jogo.equipa_fora)}&select=id`;
            const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const matchesDb = await resMatch.json();

            if (!matchesDb || matchesDb.length === 0) {
                console.log(`   ⚠️ Jogo principal não encontrado no Supabase: ${jogo.equipa_casa} vs ${jogo.equipa_fora}`);
                erros++;
                continue; // Salta para o próximo
            }

            const matchId = matchesDb[0].id;

            // 2. Verificar se o detalhe da dupla (R1, R2, R3) já existe neste encontro
            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${jogo.rubber_number}&select=id,result,home_duo,away_duo`;
            const resDetail = await fetch(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const detailsDb = await resDetail.json();

            const payload = {
                match_id: matchId,
                rubber_number: jogo.rubber_number,
                home_duo: jogo.home_duo,
                away_duo: jogo.away_duo,
                result: jogo.result
            };

            if (detailsDb && detailsDb.length > 0) {
                const detailId = detailsDb[0].id;
                const resultAntigo = detailsDb[0].result;

                // 3. Se já existe, verificamos se o resultado (ou nomes) mudaram
                if (resultAntigo !== jogo.result || detailsDb[0].home_duo !== jogo.home_duo) {
                    const urlUpdate = `${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`;
                    await fetch(urlUpdate, {
                        method: 'PATCH', // PATCH = Update parcial
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    atualizados++;
                } else {
                    ignorados++; // Está tudo igualzinho, ignorar!
                }
            } else {
                // 4. Se não existe, INSERE novo!
                await fetch(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                inseridos++;
            }
        } catch (error) {
            console.error(`   ❌ Falha ao processar ${jogo.equipa_casa} vs ${jogo.equipa_fora}:`, error.message);
            erros++;
        }
    }

    // O relatório final
    console.log(`\n📊 RELATÓRIO DO SUPABASE:`);
    console.log(`   ✅ Inseridos (Novos): ${inseridos}`);
    console.log(`   🔄 Atualizados (Mudança no resultado/nomes): ${atualizados}`);
    console.log(`   ⏭️ Ignorados (Já existiam e iguais): ${ignorados}`);
    console.log(`   ⚠️ Erros/Faltam na tabela 'matches': ${erros}\n`);
}

(async () => {
    console.log("🚀 A iniciar a 'Aranha' de Extração ULTIMATE + Sincronização...");

    const browser = await puppeteer.launch({
        headless: "new", // Seguro para a nuvem
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Evita que o GitHub Actions bloqueie o Chrome
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        console.log(`🌐 A aceder à página base do torneio...`);
        await page.goto(URL, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#drop_tournaments', { visible: true });

        const categorias = await page.evaluate(() => {
            const select = document.querySelector('#drop_tournaments');
            if (!select) return [];
            return Array.from(select.options)
                .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
        });

        console.log(`🎯 Encontrei ${categorias.length} categorias!\n`);

        const todosOsJogos = [];

        for (const cat of categorias) {
            console.log(`\n==================================================`);
            console.log(`🎾 A explorar categoria: ${cat.nome}...`);

            await page.goto(URL, { waitUntil: 'networkidle2' });

            await page.waitForSelector('#drop_tournaments', { visible: true });
            await page.select('#drop_tournaments', cat.valor);

            await new Promise(r => setTimeout(r, 4000));

            await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const encontrosLinks = links.filter(l => l.innerText.trim() === 'ENCONTROS');
                if (encontrosLinks.length > 0) encontrosLinks[encontrosLinks.length - 1].click();
            });

            await new Promise(r => setTimeout(r, 4000));

            const grupos = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.map(l => l.innerText.trim()).filter(text => text.includes("Grupo") || text === "Main");
            });

            if (grupos.length === 0) continue;

            for (const grupo of grupos) {
                console.log(`   🖱️ A extrair o ${grupo}...`);

                await page.evaluate((nomeGrupo) => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const target = links.find(l => l.innerText.trim() === nomeGrupo);
                    if (target) target.click();
                }, grupo);

                await new Promise(r => setTimeout(r, 4000));

                const numJogos = await page.evaluate(() => {
                    const ths = Array.from(document.querySelectorAll('th'));
                    const acoesTh = ths.find(th => th.innerText.trim() === 'Ações');
                    if (!acoesTh) return 0;

                    const acoesIndex = Array.from(acoesTh.parentElement.children).indexOf(acoesTh);
                    let count = 0;

                    document.querySelectorAll('tr').forEach(row => {
                        const tds = row.querySelectorAll('td');
                        if (tds.length > acoesIndex && tds[acoesIndex].querySelector('a, button, input')) count++;
                    });
                    return count;
                });

                if (numJogos === 0) continue;

                for (let i = 0; i < numJogos; i++) {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                        page.evaluate((index) => {
                            const ths = Array.from(document.querySelectorAll('th'));
                            const acoesTh = ths.find(th => th.innerText.trim() === 'Ações');
                            if (!acoesTh) return;

                            const acoesIndex = Array.from(acoesTh.parentElement.children).indexOf(acoesTh);
                            const links = [];

                            document.querySelectorAll('tr').forEach(row => {
                                const tds = row.querySelectorAll('td');
                                if (tds.length > acoesIndex) {
                                    const btn = tds[acoesIndex].querySelector('a, button, input');
                                    if(btn) links.push(btn);
                                }
                            });
                            if(links[index]) links[index].click();
                        }, i)
                    ]);

                    await new Promise(r => setTimeout(r, 3000));

                    const jogosExtraidos = await page.evaluate((nomeCat, nomeGrupo) => {
                        const details = [];
                        const validHeaders = Array.from(document.querySelectorAll('th')).map(th => th.innerText.trim()).filter(texto => texto.length > 0);
                        const dataIndex = validHeaders.indexOf('Data');

                        if (dataIndex === -1) return { erro: "Tabela de duplas não carregou." };

                        const homeTeamRaw = validHeaders[dataIndex + 1];
                        const awayTeamRaw = validHeaders[dataIndex + 2];

                        // CORREÇÃO FINAL DOS NOMES!
                        const cleanText = (text) => text
                            .replace(/✔/g, '')
                            .replace(/\n/g, ' / ')
                            .replace(/\s*\/\s*\/\s*/g, ' / ')
                            .replace(/\s+/g, ' ')
                            .replace(/^[ \/]+|[ \/]+$/g, '') // Remove lixo das pontas (barras ou espaços)
                            .trim();

                        const rows = document.querySelectorAll('tr');
                        rows.forEach(row => {
                            const tds = Array.from(row.querySelectorAll('td'));
                            const rowTexts = tds.map(td => td.innerText.trim());
                            const rIndex = rowTexts.findIndex(txt => /^R\d$/.test(txt));

                            if (rIndex !== -1 && rowTexts.length > rIndex + 3) {
                                const rubber = parseInt(rowTexts[rIndex].replace('R', ''));
                                let homeDuo = cleanText(rowTexts[rIndex + 2]);
                                let awayIndex = rowTexts[rIndex + 3] === '-' ? rIndex + 4 : rIndex + 3;
                                let awayDuo = cleanText(rowTexts[awayIndex]);
                                let scoreIndex = awayIndex + 1;
                                if (rowTexts[scoreIndex] === '✔' || rowTexts[scoreIndex] === '') scoreIndex++;
                                let score = cleanText(rowTexts[scoreIndex]);

                                if (rubber && score && score !== "" && score !== "Tba") {
                                    details.push({
                                        categoria: nomeCat,
                                        grupo: nomeGrupo,
                                        equipa_casa: homeTeamRaw,
                                        equipa_fora: awayTeamRaw,
                                        rubber_number: rubber,
                                        home_duo: homeDuo,
                                        away_duo: awayDuo,
                                        result: score
                                    });
                                }
                            }
                        });
                        return details;
                    }, cat.nome, grupo);

                    if (jogosExtraidos.length > 0) todosOsJogos.push(...jogosExtraidos);

                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                        page.evaluate(() => {
                            const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                            if (btn) btn.click();
                        })
                    ]);
                    await new Promise(r => setTimeout(r, 4000));
                }
            }
        }

        fs.writeFileSync(`todos_os_jogos.json`, JSON.stringify(todosOsJogos, null, 2));
        console.log(`\n🎉 Extracção Finalizada! ${todosOsJogos.length} jogos encontrados.`);

        // --- A MAGIA DA SINCRONIZAÇÃO ACONTECE AQUI ---
        if (todosOsJogos.length > 0) {
            await sincronizarComSupabase(todosOsJogos);
        }

    } catch (err) {
        console.error("❌ Erro catastrófico:", err);
    } finally {
        await browser.close();
        console.log("🛑 Browser fechado.");
    }
})();