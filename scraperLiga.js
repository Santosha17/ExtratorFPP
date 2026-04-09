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

const ZONA_ALVO = process.env.SCRAPE_ZONA;
const TIPO_ALVO = process.env.SCRAPE_TIPO;
const CATEGORIA_ALVO = process.env.SCRAPE_CATEGORIA;
const GRUPO_ALVO = process.env.SCRAPE_GRUPO;

const torneiosParaCorrer = TORNEIOS_LIGA.filter(t => {
    const fTipo = TIPO_ALVO ? t.tipo === TIPO_ALVO : true;
    const fZona = ZONA_ALVO ? t.nome === ZONA_ALVO : true;
    return fTipo && fZona;
});

const cacheEquipas = new Set();

async function registarEquipa(nome, zona, tipo, categoria, grupo) {
    if (!nome || nome === "") return;
    const idUnico = `${nome}|${zona}|${tipo}|${categoria}|${grupo}`;
    if (cacheEquipas.has(idUnico)) return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/equipas`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
            body: JSON.stringify({ nome, zona, tipo, categoria, grupo })
        });
        cacheEquipas.add(idUnico);
    } catch (e) {}
}

async function guardarNoSupabaseEmTempoReal(jogosExtraidos) {
    if (!jogosExtraidos || jogosExtraidos.length === 0) return;

    let finalHomeScore = 0;
    let finalAwayScore = 0;
    let matchStatus = 'scheduled';

    const jogoBase = jogosExtraidos[0];

    if (jogoBase.fakeResult && /^\d+\s*-\s*\d+$/.test(jogoBase.fakeResult)) {
        const p = jogoBase.fakeResult.split('-');
        finalHomeScore = parseInt(p[0].trim());
        finalAwayScore = parseInt(p[1].trim());
        matchStatus = 'completed';
    } else if (jogoBase.fakeResult && (jogoBase.fakeResult.toLowerCase().includes('w.o') || jogoBase.fakeResult.toLowerCase().includes('walkover'))) {
        matchStatus = 'completed';
    } else {
        let temPontuacaoReal = false;
        for (const j of jogosExtraidos) {
            const cleanResult = j.result ? j.result.toLowerCase().trim() : '';
            if (j.rubber_number && cleanResult !== 'tba' && cleanResult !== '' && cleanResult !== '-' && cleanResult !== '0-0') {
                let hSets = 0, aSets = 0;
                const sets = j.result.replace(/[^\d\s\-]/g, ' ').trim().split(/\s+/);
                for (let s of sets) {
                    const parts = s.split('-');
                    if (parts.length === 2) {
                        const h = parseInt(parts[0]), a = parseInt(parts[1]);
                        if (!isNaN(h) && !isNaN(a)) {
                            if (h > a) hSets++; else if (a > h) aSets++;
                        }
                    }
                }
                if (hSets > aSets) { finalHomeScore++; temPontuacaoReal = true; }
                else if (aSets > hSets) { finalAwayScore++; temPontuacaoReal = true; }
            }
        }
        if (temPontuacaoReal) matchStatus = 'completed';
    }

    try {
        await registarEquipa(jogoBase.home_team, jogoBase.zona, jogoBase.tipo, jogoBase.categoria, jogoBase.grupo);
        await registarEquipa(jogoBase.away_team, jogoBase.zona, jogoBase.tipo, jogoBase.categoria, jogoBase.grupo);

        const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(jogoBase.home_team)}&away_team=eq.${encodeURIComponent(jogoBase.away_team)}&zona=eq.${encodeURIComponent(jogoBase.zona)}&categoria=eq.${encodeURIComponent(jogoBase.categoria)}&select=id`;
        const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const matchesDb = await resMatch.json();

        const hScore = matchStatus === 'completed' ? finalHomeScore : null;
        const aScore = matchStatus === 'completed' ? finalAwayScore : null;

        const payload = {
            epoca: "2026", fase: "Fase Regular", zona: jogoBase.zona, tipo: jogoBase.tipo,
            categoria: jogoBase.categoria, grupo: jogoBase.grupo, home_team: jogoBase.home_team,
            away_team: jogoBase.away_team, data_jogo: jogoBase.data_jogo, status: matchStatus,
            home_score: hScore,
            away_score: aScore
        };

        let matchId;
        if (!matchesDb || matchesDb.length === 0) {
            const resCreate = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify(payload)
            });
            const newM = await resCreate.json();
            matchId = newM[0].id;
        } else {
            matchId = matchesDb[0].id;
            await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        for (const r of jogosExtraidos) {
            if (!r.rubber_number || !r.result) continue;
            await fetch(`${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${r.rubber_number}`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify({ match_id: matchId, rubber_number: r.rubber_number, home_duo: r.home_duo, away_duo: r.away_duo, result: r.result })
            });
        }
    } catch (e) { console.error("❌ Erro Supabase:", e.message); }
}

async function esperarPeloTiePadel(page) {
    try {
        await page.waitForFunction(() => {
            if (typeof window.Sys !== 'undefined' && window.Sys.WebForms && window.Sys.WebForms.PageRequestManager) {
                return !window.Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack();
            }
            return true;
        }, { timeout: 12000 });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
}

(async () => {
    console.log("🚀 Iniciando Aranha V13 - Filtro Extremo de Cabeçalho...");
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    for (const torneio of torneiosParaCorrer) {
        console.log(`\n🌍 Extração: ${torneio.nome} | ${torneio.tipo}`);

        try {
            await page.goto(torneio.url, { waitUntil: 'networkidle2' });
            await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });

            const cats = await page.evaluate(() => Array.from(document.querySelector('#drop_tournaments').options).filter(o => o.value !== "0").map(o => ({ valor: o.value, nome: o.innerText.trim() })));

            for (const cat of cats) {
                if (CATEGORIA_ALVO && !cat.nome.toUpperCase().includes(CATEGORIA_ALVO.toUpperCase())) continue;
                console.log(`🎾 Categoria: ${cat.nome}`);

                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });

                await page.select('#drop_tournaments', cat.valor);
                await esperarPeloTiePadel(page);

                const clicouEncontros = await page.evaluate(() => {
                    const lks = Array.from(document.querySelectorAll('a, span'));
                    const target = lks.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                    if (target) { target.click(); return true; } return false;
                });

                if (!clicouEncontros) continue;
                await esperarPeloTiePadel(page);

                const gps = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(l => l.innerText.trim()).filter(t => t.includes("Grupo") || t === "Main"));

                for (const grupo of gps) {
                    if (GRUPO_ALVO && !grupo.toUpperCase().includes(GRUPO_ALVO.toUpperCase())) continue;
                    console.log(`   🔎 Grupo: ${grupo} | A extrair...`);

                    await page.evaluate((g) => {
                        const a = Array.from(document.querySelectorAll('a')).find(el => el.innerText.trim() === g);
                        if(a) { a.click(); window.scrollTo(0, document.body.scrollHeight / 3); }
                    }, grupo);

                    await esperarPeloTiePadel(page);

                    const metas = await page.evaluate(() => {
                        const res = [];
                        const rows = document.querySelectorAll('table tr');

                        rows.forEach(tr => {
                            const tds = Array.from(tr.querySelectorAll('td'));
                            if (tds.length < 3) return;

                            let home = "", away = "", dataJogo = null, mainResult = "";

                            const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                            if (dashIdx > 0 && dashIdx < tds.length - 1) {
                                home = tds[dashIdx-1].innerText.replace(/✔/g,'').trim();
                                away = tds[dashIdx+1].innerText.replace(/✔/g,'').trim();
                            } else {
                                for (let i = 0; i < tds.length; i++) {
                                    let txt = tds[i].innerText.replace(/✔/g, '').trim();
                                    if (txt.includes(' - ') && !/^\d/.test(txt) && !txt.toLowerCase().includes('w.o')) {
                                        const parts = txt.split(/\s+-\s+/);
                                        if (parts.length >= 2) {
                                            home = parts[0].trim();
                                            away = parts.slice(1).join(' - ').trim();
                                            break;
                                        }
                                    }
                                }
                            }

                            if (home !== "" && away !== "") {
                                for (let j = 0; j < tds.length; j++) {
                                    let txt = tds[j].innerText.replace(/✔/g, '').trim();
                                    if (txt.match(/^\d+\s*[- ]\s*\d+$/)) {
                                        const nums = txt.match(/\d+/g);
                                        mainResult = `${nums[0]}-${nums[1]}`;
                                        break;
                                    } else if (txt.toLowerCase().includes('w.o') || txt.toLowerCase().includes('walkover')) {
                                        mainResult = txt;
                                        break;
                                    }
                                }

                                tds.forEach(td => {
                                    const text = td.innerText.replace(/\n/g, ' ').trim();
                                    const mPT = text.match(/(\d{2})[\/\-\s]+(\d{2})[\/\-\s]+(\d{4})(?:[,\s]+(?:Início\s*às\s*)?(\d{2}:\d{2}))?/i);
                                    const mISO = text.match(/(\d{4})[\/\-\s]+(\d{2})[\/\-\s]+(\d{2})(?:[,\s]+(?:Início\s*às\s*)?(\d{2}:\d{2}))?/i);
                                    if (mPT && !dataJogo) dataJogo = `${mPT[3]}-${mPT[2]}-${mPT[1]} ${mPT[4] || '00:00'}:00`;
                                    else if (mISO && !dataJogo) dataJogo = `${mISO[1]}-${mISO[2]}-${mISO[3]} ${mISO[4] || '00:00'}:00`;
                                });

                                // ✨ FILTRO SUPREMO: SE NÃO TEM DATA VÁLIDA, NÃO É JOGO, É CABEÇALHO LIXO!
                                if (dataJogo !== null) {
                                    res.push({ home, away, dataJogo, mainResult });
                                }
                            }
                        });
                        return res;
                    });

                    console.log(`      📊 Encontrados ${metas.length} encontros.`);

                    for (const m of metas) {
                        try {
                            if (!m.mainResult || m.mainResult.trim() === "") {
                                await guardarNoSupabaseEmTempoReal([{
                                    zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo,
                                    home_team: m.home, away_team: m.away, data_jogo: m.dataJogo, fakeResult: null
                                }]);
                                continue;
                            }

                            await page.evaluate((g) => {
                                const a = Array.from(document.querySelectorAll('a')).find(el => el.innerText.trim() === g);
                                if(a) a.click();
                            }, grupo);
                            await esperarPeloTiePadel(page);

                            const abriu = await page.evaluate((h, a) => {
                                const rows = document.querySelectorAll('table tr');
                                for (let tr of rows) {
                                    const tds = Array.from(tr.querySelectorAll('td'));
                                    if (tds.length < 3) continue;

                                    let rHome = "", rAway = "";
                                    const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                                    if (dashIdx > 0 && dashIdx < tds.length - 1) {
                                        rHome = tds[dashIdx-1].innerText.replace(/✔/g,'').trim();
                                        rAway = tds[dashIdx+1].innerText.replace(/✔/g,'').trim();
                                    } else {
                                        for (let i = 0; i < tds.length - 1; i++) {
                                            let txt = tds[i].innerText.replace(/✔/g, '').trim();
                                            if (txt.includes(' - ') && !/^\d/.test(txt)) {
                                                const parts = txt.split(/\s+-\s+/);
                                                if (parts.length >= 2) {
                                                    rHome = parts[0].trim();
                                                    rAway = parts.slice(1).join(' - ').trim();
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (rHome === h && rAway === a) {
                                        const btn = tr.querySelector('a[id*="link_open_rubbers"], a[mytitle="Abrir"]');
                                        if (btn) { btn.click(); return true; }
                                    }
                                }
                                return false;
                            }, m.home, m.away);

                            if (!abriu) {
                                await guardarNoSupabaseEmTempoReal([{
                                    zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo,
                                    home_team: m.home, away_team: m.away, data_jogo: m.dataJogo, fakeResult: m.mainResult
                                }]);
                                continue;
                            }

                            await esperarPeloTiePadel(page);

                            const rbs = await page.evaluate((metaInfo, nCat, nGrp, nZona, nTipo) => {
                                const details = [];
                                const cleanDuo = (t) => {
                                    if(!t) return null;
                                    let c = t.replace(/✔/g, '').replace(/\n/g, ' / ').trim();
                                    c = c.replace(/\s*\/\s*/g, ' / ').replace(/(\/\s*)+/g, '/ ').replace(/^\s*\/\s*|\s*\/\s*$/g, '').trim();
                                    if (c.toLowerCase().includes("a anunciar") || c === "-" || c === "") return null;
                                    return c;
                                };

                                const cleanScore = (t) => {
                                    if(!t) return null;
                                    return t.replace(/✔/g, '').replace(/\n/g, ' ').trim();
                                };

                                document.querySelectorAll('table tr').forEach(row => {
                                    const tds = Array.from(row.querySelectorAll('td'));
                                    const rIdx = tds.findIndex(td => /^R\d$/.test(td.innerText.trim()));

                                    if (rIdx !== -1) {
                                        const rubberNum = parseInt(tds[rIdx].innerText.replace('R','').trim());
                                        const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');

                                        if (dashIdx !== -1 && dashIdx > 0 && dashIdx < tds.length - 1) {
                                            const homeDuo = cleanDuo(tds[dashIdx - 1].innerText);
                                            const awayDuo = cleanDuo(tds[dashIdx + 1].innerText);

                                            let result = null;
                                            for (let i = dashIdx + 2; i < tds.length; i++) {
                                                let val = tds[i].innerText.replace(/✔/g, '').trim();
                                                if (val !== '' && val !== 'Tba') {
                                                    result = cleanScore(val);
                                                    break;
                                                }
                                            }

                                            details.push({
                                                zona: nZona, tipo: nTipo, categoria: nCat, grupo: nGrp,
                                                home_team: metaInfo.home, away_team: metaInfo.away, data_jogo: metaInfo.dataJogo,
                                                rubber_number: rubberNum,
                                                home_duo: homeDuo,
                                                away_duo: awayDuo,
                                                result: result,
                                                fakeResult: metaInfo.mainResult
                                            });
                                        }
                                    }
                                });
                                return details;
                            }, m, cat.nome, grupo, torneio.nome, torneio.tipo);

                            await guardarNoSupabaseEmTempoReal(rbs.length > 0 ? rbs : [{ zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo, home_team: m.home, away_team: m.away, data_jogo: m.dataJogo, fakeResult: m.mainResult }]);

                            await page.evaluate(() => {
                                const b = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                if(b) b.click();
                            });
                            await esperarPeloTiePadel(page);

                        } catch (errInterno) {
                            console.error(`      ⚠️ Erro menor ao raspar jogo, a continuar...`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`❌ Erro crítico no torneio ${torneio.nome}:`, e.message);
        }
    }
    await browser.close();
    console.log("🛑 Limpeza terminada.");
})();