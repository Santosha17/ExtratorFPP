require('dotenv').config();
const puppeteer = require('puppeteer');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

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

// 🚀 NOVA FUNÇÃO: Agora recebe os Metadados do Encontro separados das Duplas!
async function guardarNoSupabaseEmTempoReal(meta, jogosExtraidos) {
    let matchStatus = 'scheduled';
    if (meta.home_score !== null && meta.away_score !== null) matchStatus = 'completed';

    try {
        let matchId;

        // 1. RESOLVIDO O TIMEZONE: Procura SÓ pelas equipas e grupo. Sem data = sem bugs de UTC.
        let urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(meta.home_team)}&away_team=eq.${encodeURIComponent(meta.away_team)}&zona=eq.${encodeURIComponent(meta.zona)}&categoria=eq.${encodeURIComponent(meta.categoria)}&grupo=eq.${encodeURIComponent(meta.grupo)}&select=id`;

        const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const matchesDb = await resMatch.json();

        // Formata a data para UTC forçado para o Supabase não chorar
        const dbDate = meta.data_jogo ? meta.data_jogo.replace(' ', 'T') + '+00:00' : null;

        const payloadMatch = {
            epoca: "2026", fase: "Fase Regular", zona: meta.zona, tipo: meta.tipo,
            categoria: meta.categoria, grupo: meta.grupo, home_team: meta.home_team,
            away_team: meta.away_team, data_jogo: dbDate, status: matchStatus,
            home_score: meta.home_score, away_score: meta.away_score
        };

        // 2. GRAVA O ENCONTRO (Isto acontece sempre, mesmo que as duplas deem erro!)
        if (!matchesDb || matchesDb.length === 0) {
            const resCreateMatch = await fetch(`${SUPABASE_URL}/rest/v1/matches`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, body: JSON.stringify(payloadMatch) });
            const newMatch = await resCreateMatch.json();
            if (newMatch && newMatch.length > 0) matchId = newMatch[0].id;
        } else {
            matchId = matchesDb[0].id;
            await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payloadMatch) });
        }

        if (!matchId || !jogosExtraidos || jogosExtraidos.length === 0) return;

        // 3. GRAVA AS DUPLAS COM O PATCH CORRETO
        for (const r of jogosExtraidos) {
            if (!r.rubber_number) continue;

            const payloadDetail = { match_id: matchId, rubber_number: r.rubber_number, home_duo: r.home_duo, away_duo: r.away_duo, result: r.result };

            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${r.rubber_number}&select=id`;
            const resDetailCheck = await fetch(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const existingDetails = await resDetailCheck.json();

            if (existingDetails && existingDetails.length > 0) {
                const detailId = existingDetails[0].id;
                await fetch(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ home_duo: r.home_duo, away_duo: r.away_duo, result: r.result })
                });
            } else {
                await fetch(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadDetail)
                });
            }
        }
    } catch (error) {
        console.error("❌ Erro a atualizar dados no Supabase:", error);
    }
}

(async () => {
    console.log("🚀 A iniciar a 'Aranha' PadelNetwork - Sincronização de Encontros...");
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: null });
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
                console.log(`   ⚠️ O site não carregou ou esta Zona ainda não foi publicada. A saltar...`);
                continue;
            }

            const categorias = await page.evaluate(() => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options).filter(opt => opt.value !== "0" && opt.innerText.trim() !== "").map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                console.log(`\n🎾 A processar: ${torneio.tipo} > ${cat.nome}`);
                try {
                    await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                    await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
                    await page.select('#drop_tournaments', cat.valor);
                    await new Promise(r => setTimeout(r, 4000));

                    const clicouEncontros = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a, span, div'));
                        const encontrosLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                        if (encontrosLink) { encontrosLink.click(); return true; }
                        return false;
                    });

                    if (!clicouEncontros) continue;
                    await new Promise(r => setTimeout(r, 4000));

                    const grupos = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(l => l.innerText.trim()).filter(text => text.includes("Grupo") || text === "Main");
                    });

                    const listaDeGrupos = grupos.length > 0 ? grupos : ["Fase Regular"];

                    for (const grupo of listaDeGrupos) {
                        console.log(`   🔎 A procurar jogos em: ${grupo}...`);
                        if (grupo !== "Fase Única" && grupo !== "Fase Regular") {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                                page.evaluate((nomeGrupo) => {
                                    const links = Array.from(document.querySelectorAll('a'));
                                    const target = links.find(l => l.innerText.trim() === nomeGrupo);
                                    if (target) target.click();
                                }, grupo)
                            ]);
                            await new Promise(r => setTimeout(r, 2000));
                        }

                        const metadadosJogos = await page.evaluate(() => {
                            const arr = [];
                            let indexDoBotao = 0;
                            document.querySelectorAll('table tr').forEach((tr) => {
                                const tds = Array.from(tr.querySelectorAll('td'));
                                let home = "Equipa Casa", away = "Equipa Fora", dataJogo = null;
                                let matchScoreHome = null, matchScoreAway = null;

                                const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                                if (dashIdx > 0) {
                                    home = tds[dashIdx - 1].innerText.replace(/✔/g, '').trim();
                                    away = tds[dashIdx + 1].innerText.replace(/✔/g, '').trim();
                                }

                                const scoreTd = tds.find(td => /\b[0-3]\s*-\s*[0-3]\b/.test(td.innerText));
                                if (scoreTd) {
                                    const parts = scoreTd.innerText.match(/\b([0-3])\s*-\s*([0-3])\b/);
                                    if (parts) {
                                        matchScoreHome = parseInt(parts[1]);
                                        matchScoreAway = parseInt(parts[2]);
                                    }
                                }

                                const dateRegex = /((\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4}))(?:[\s\S]*?(\d{2}:\d{2}))?/;

                                for (let td of tds) {
                                    const match = td.innerText.match(dateRegex);
                                    if (match) {
                                        let rawDate = match[1].replace(/\//g, '-');
                                        const timePart = match[4] ? `${match[4]}:00` : `00:00:00`;
                                        if (/^\d{2}-/.test(rawDate)) {
                                            const parts = rawDate.split('-');
                                            rawDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                        }
                                        dataJogo = `${rawDate} ${timePart}`;
                                        break;
                                    }
                                }

                                if(home !== "Equipa Casa" && home !== "") {
                                    // 🚀 SELETOR REFORMULADO: Foca no ID específico do botão de rubbers (os 3 traços)
                                    const btnRubbers = tr.querySelector('a[id*="link_open_rubbers"]');
                                    let temBotao = !!btnRubbers;
                                    let btnIdxToClick = temBotao ? indexDoBotao++ : -1;
                                    arr.push({ home, away, dataJogo, matchScoreHome, matchScoreAway, temBotao, btnIdxToClick });
                                }
                            });
                            return arr;
                        });

                        for (let i = 0; i < metadadosJogos.length; i++) {
                            const meta = metadadosJogos[i];

                            const metaParaBD = {
                                zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo: grupo,
                                home_team: meta.home, away_team: meta.away, data_jogo: meta.dataJogo,
                                home_score: meta.matchScoreHome, away_score: meta.matchScoreAway
                            };

                            const agora = new Date();
                            const dataDoJogo = meta.dataJogo ? new Date(meta.dataJogo.replace(' ', 'T')) : null;
                            const isFuturo = dataDoJogo && dataDoJogo > agora;

                            if (!meta.temBotao || isFuturo) {
                                console.log(`      ⏳ ${meta.home} vs ${meta.away}: Agendado para ${meta.dataJogo}.`);
                                await guardarNoSupabaseEmTempoReal(metaParaBD, []);
                                continue;
                            }

                            console.log(`      -> A processar: ${meta.home} vs ${meta.away}...`);

                            await page.evaluate(() => {
                                const grid = document.querySelector('table[id*="grid_rubbers"] tbody');
                                if (grid) grid.innerHTML = '';
                            });

                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                                page.evaluate((idx) => {
                                    // 🚀 CLIQUE REFORMULADO: Garante que clica apenas nos botões de rubbers (3 traços)
                                    const btns = document.querySelectorAll('a[id*="link_open_rubbers"]');
                                    if (btns[idx]) btns[idx].click();
                                }, meta.btnIdxToClick)
                            ]);

                            await new Promise(r => setTimeout(r, 4500));

                            const jogosExtraidos = await page.evaluate(() => {
                                const details = [];

                                // 🚀 FUNÇÃO DE LIMPEZA ATUALIZADA
                                const cleanText = (text) => {
                                    if (!text) return "";
                                    return text
                                        .replace(/✔/g, '')             // Remove o checkmark
                                        .replace(/\n/g, ' / ')         // Transforma quebra de linha em barra
                                        .replace(/\s+/g, ' ')          // Remove espaços duplos
                                        .replace(/\s*\/\s*\/\s*/g, ' / ') // Evita barras duplas //
                                        .replace(/^[\s/]+|[\s/]+$/g, '') // 🎯 AQUI: Remove espaços ou barras no INÍCIO e no FIM
                                        .trim();
                                };

                                document.querySelectorAll('table tr').forEach(row => {
                                    const tds = Array.from(row.querySelectorAll('td'));
                                    const rowTexts = tds.map(td => td.innerText.trim());
                                    const rIndex = rowTexts.findIndex(txt => /^R\d$/.test(txt));

                                    if (rIndex !== -1 && rowTexts.length > rIndex + 3) {
                                        const rubberNum = parseInt(rowTexts[rIndex].replace('R', ''));

                                        // Âncora no traço para não trocar as duplas
                                        let dashIndex = rowTexts.findIndex((t, idx) => idx > rIndex && t === '-');
                                        if (dashIndex === -1) dashIndex = rIndex + 3;

                                        let homeDuo = cleanText(rowTexts[dashIndex - 1]);
                                        let awayDuo = cleanText(rowTexts[dashIndex + 1]);

                                        let scoreIndex = dashIndex + 2;
                                        if (rowTexts[scoreIndex] === '✔' || rowTexts[scoreIndex] === '') scoreIndex++;
                                        let score = cleanText(rowTexts[scoreIndex]);

                                        if (rubberNum) {
                                            details.push({ rubber_number: rubberNum, home_duo: homeDuo, away_duo: awayDuo, result: score });
                                        }
                                    }
                                });
                                return details;
                            });

                            await guardarNoSupabaseEmTempoReal(metaParaBD, jogosExtraidos);

                            await page.evaluate(() => {
                                const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                if (btn) btn.click();
                            });
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }
                } catch (catError) {}
            }
        }
    } catch (err) {} finally { await browser.close(); }
})();