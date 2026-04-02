const puppeteer = require('puppeteer');
const fs = require('fs');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = "https://eezbrdjncjjgmjueftgg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlemJyZGpuY2pqZ21qdWVmdGdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzNzEyMywiZXhwIjoyMDkwNzEzMTIzfQ.KDGRw0MClRKxYUyOMiglb8VYGn8uHii79i-3hYkAWlc"; // Service Role Key
// ---------------------------------

const TORNEIOS_LIGA = [
    { nome: "Zona 1A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/b996ef02-a837-48b5-a7d3-3f86077fb585/Draws" },
    { nome: "Zona 1A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/71d3b007-c015-46b7-90de-181bc5e7f45d/Draws" },
    { nome: "Zona 1B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/c55f6966-2a0a-45db-891d-0e380ff79879/Draws" },
    { nome: "Zona 1B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/4bfee2ef-879a-4fd7-a0aa-af46e9d44485/Draws" },
    { nome: "Zona 1C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/d7229a65-03ae-4b89-969a-ae104736139b/Draws" },
    { nome: "Zona 1C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/40f779ef-fa5c-4c3a-919e-961f2ee17048/Draws" },
    { nome: "Zona 2", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/b028a5c4-fa22-4b1a-af5f-ef38d675bc7d/Draws" },
    { nome: "Zona 2", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/dbf74418-49f7-48c8-8e23-546f6d4b2aee/Draws" },
    { nome: "Zona 3A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/51ab7f23-a435-47c6-b0e3-16839d3585d7/Draws" },
    { nome: "Zona 3A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/36c21e4e-c3e1-4f67-9fea-53cf9fb7e72e/Draws" },
    { nome: "Zona 3B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona3B/Draws" },
    { nome: "Zona 3B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/87d6ab8b-3fa6-4b80-8692-fd527afd1da3/Draws" },
    { nome: "Zona 3C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/f642cf7e-c5f3-43c6-bc4e-b86c67f14374/Draws" },
    { nome: "Zona 3C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/bd75b6b0-f5b7-4852-b65f-499646e07c9c/Draws" },
    { nome: "Zona 3D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/7e0cc576-24ab-4ea4-9090-c496970ce8bc/Draws" },
    { nome: "Zona 3D", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/feace55d-c56c-4853-9249-aadedba5f923/Draws" },
    { nome: "Zona 4A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4A/Draws" },
    { nome: "Zona 4A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/06d421b9-6fd7-4b5c-a1f0-4b619cef170b/Draws" },
    { nome: "Zona 4B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4B/Draws" },
    { nome: "Zona 4B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/f0eea46a-dec7-4bbe-8051-b11565a7a6fc/Draws" },
    { nome: "Zona 4C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4C/Draws" },
    { nome: "Zona 4C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona4C/Draws" },
    { nome: "Zona 4D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4D/Draws" },
    { nome: "Zona 4D", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/6ca9340a-e4ff-459d-ba60-44439acf98f9/Draws" },
    { nome: "Zona 5", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona5/Draws" },
    { nome: "Zona 5", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/67abb21b-fa70-499a-bb3b-74c51f2f59a3/Draws" },
    { nome: "Zona 6A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona6A/Draws" },
    { nome: "Zona 6A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona6A/Draws" },
    { nome: "Zona 6B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona6B/Draws" },
    { nome: "Zona 6B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona6B/Draws" },
    { nome: "Zona 7A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona7A/Draws" },
    { nome: "Zona 7A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/2af4cd70-9fde-4d3f-8c50-83637799aa3d/Draws" },
    { nome: "Zona 7B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona7B/Draws" },
    { nome: "Zona 7B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/4f14c7fc-3318-4ba6-84d0-dc5417d4d9d4/Draws" },
    { nome: "Zona 8A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona8A/Draws" },
    { nome: "Zona 8A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona8A/Draws" },
    { nome: "Zona 8B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona8B/Draws" },
    { nome: "Zona 8B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/8281b86b-4251-4751-ac33-68cd5aa3c37a/Draws" }
];

// --- FUNÇÃO: GUARDA DIRETAMENTE NO MOMENTO DA EXTRAÇÃO ---
async function guardarNoSupabaseEmTempoReal(jogosExtraidos) {
    for (const jogo of jogosExtraidos) {
        try {
            let matchId;

            // 1. Procurar se o "Encontro" principal já existe (agora usando também a coluna "tipo")
            const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(jogo.equipa_casa)}&away_team=eq.${encodeURIComponent(jogo.equipa_fora)}&zona=eq.${encodeURIComponent(jogo.zona)}&tipo=eq.${encodeURIComponent(jogo.tipo)}&categoria=eq.${encodeURIComponent(jogo.categoria)}&select=id`;
            const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const matchesDb = await resMatch.json();

            // 2. SE NÃO EXISTE, CRIA O ENCONTRO AGORA MESMO!
            if (!matchesDb || matchesDb.length === 0) {
                const payloadMatch = {
                    zona: jogo.zona,
                    tipo: jogo.tipo,
                    categoria: jogo.categoria,
                    grupo: jogo.grupo,
                    home_team: jogo.equipa_casa,
                    away_team: jogo.equipa_fora
                };

                const resCreateMatch = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(payloadMatch)
                });

                const newMatch = await resCreateMatch.json();
                matchId = newMatch[0].id;
                console.log(`   🆕 Novo Encontro: ${jogo.equipa_casa} vs ${jogo.equipa_fora} | ${jogo.tipo} > ${jogo.categoria}`);
            } else {
                matchId = matchesDb[0].id;
            }

            // 3. Agora lidamos com as Duplas e Resultados (match_details)
            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${jogo.rubber_number}&select=id,result,home_duo,away_duo`;
            const resDetail = await fetch(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const detailsDb = await resDetail.json();

            const payloadDetail = {
                match_id: matchId,
                rubber_number: jogo.rubber_number,
                home_duo: jogo.home_duo,
                away_duo: jogo.away_duo,
                result: jogo.result
            };

            if (detailsDb && detailsDb.length > 0) {
                const detailId = detailsDb[0].id;
                const resultAntigo = detailsDb[0].result;

                if (resultAntigo !== jogo.result || detailsDb[0].home_duo !== jogo.home_duo) {
                    await fetch(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`, {
                        method: 'PATCH',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadDetail)
                    });
                    console.log(`   🔄 Atualizado: R${jogo.rubber_number} (${jogo.result})`);
                }
            } else {
                await fetch(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadDetail)
                });
                console.log(`   ✅ Inserido: R${jogo.rubber_number} (${jogo.home_duo} vs ${jogo.away_duo})`);
            }
        } catch (error) {
            console.error(`   ❌ Falha a guardar na BD (${jogo.equipa_casa} vs ${jogo.equipa_fora}):`, error.message);
        }
    }
}

// --- O MOTOR DO PUPPETEER ---
(async () => {
    console.log("🚀 A iniciar a 'Aranha' PadelNetwork - EDIÇÃO NACIONAL...");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        for (const torneio of TORNEIOS_LIGA) {
            console.log(`\n==================================================`);
            console.log(`🌍 A INICIAR EXTRAÇÃO: ${torneio.nome} | ${torneio.tipo}`);
            console.log(`==================================================`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
            } catch (e) {
                console.error(`❌ Erro ao carregar a página da ${torneio.nome} (${torneio.tipo}). A saltar para a próxima...`);
                continue;
            }

            const categorias = await page.evaluate(() => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options)
                    .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                    .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                // Mensagem de log atualizada
                console.log(`\n🎾 A processar: ${torneio.tipo} > ${cat.nome}`);

                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
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
                    console.log(`   🖱️ A extrair e guardar o ${grupo}...`);

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

                        const jogosExtraidos = await page.evaluate((nomeCat, nomeGrupo, nomeZona, tipoTorneio) => {
                            const details = [];
                            const validHeaders = Array.from(document.querySelectorAll('th')).map(th => th.innerText.trim()).filter(texto => texto.length > 0);
                            const dataIndex = validHeaders.indexOf('Data');

                            if (dataIndex === -1) return [];

                            const homeTeamRaw = validHeaders[dataIndex + 1];
                            const awayTeamRaw = validHeaders[dataIndex + 2];

                            const cleanText = (text) => text.replace(/✔/g, '').replace(/\n/g, ' / ').replace(/\s*\/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').replace(/^[ \/]+|[ \/]+$/g, '').trim();

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
                                            zona: nomeZona,
                                            tipo: tipoTorneio,    // <-- GUARDA O TIPO AQUI (Absolutos/Veteranos)
                                            categoria: nomeCat,   // <-- GUARDA A CATEGORIA AQUI (M2, +35)
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
                        }, cat.nome, grupo, torneio.nome, torneio.tipo); // <-- Variáveis injetadas

                        if (jogosExtraidos.length > 0) {
                            await guardarNoSupabaseEmTempoReal(jogosExtraidos);
                        }

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
        }
        console.log(`\n🎉 Processo Total Finalizado com Sucesso em Todo o País!`);

    } catch (err) {
        console.error("❌ Erro catastrófico no motor principal:", err);
    } finally {
        await browser.close();
        console.log("🛑 Browser fechado. Base de dados atualizada!");
    }
})();