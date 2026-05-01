require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = globalThis.fetch || require('node-fetch');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

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

const mapaEquipas = {};

async function carregarEquipas() {
    console.log("📥 [Liga] Mapeando IDs das equipas...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/equipas?select=id,nome,zona,tipo,categoria`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Range': '0-2000'
            }
        });
        const dados = await res.json();
        if (!Array.isArray(dados)) return;
        dados.forEach(e => {
            const cat = e.categoria ? e.categoria.toLowerCase().trim() : 'sem-categoria';
            const chave = `${e.nome}|${e.zona}|${e.tipo}|${cat}`.toLowerCase().trim();
            mapaEquipas[chave] = e.id;
        });
        console.log(`✅ [Liga] ${Object.keys(mapaEquipas).length} equipas mapeadas.`);
    } catch (err) {
        console.error("❌ [Liga] Erro ao carregar equipas:", err.message);
    }
}

async function upsertJogadores(plantel, idEquipaDB) {
    if (plantel.length === 0) return false;
    const jogadores = plantel.map(j => ({ fpp_id: j.fpp_id, nome: j.nome, pontos_fpp: j.pontos_fpp, updated_at: j.updated_at }));
    const ligacoes = plantel.map(j => ({ fpp_id: j.fpp_id, equipa_id: idEquipaDB, pontos_equipa: j.pontos_fpp }));

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/jogadores?on_conflict=fpp_id`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(jogadores)
        });
        await fetch(`${SUPABASE_URL}/rest/v1/jogadores_equipas?on_conflict=fpp_id,equipa_id`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(ligacoes)
        });
        return true;
    } catch (err) {
        console.error("❌ [Liga] Erro Gravação:", err.message);
        return false;
    }
}

async function iniciarScraper() {
    console.log("🚀 [Liga] Iniciando...");
    await carregarEquipas();

    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        headless: "new"
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        for (const torneio of TORNEIOS_LIGA) {
            console.log(`🌍 [Liga] ZONA: ${torneio.nome} | ${torneio.tipo}`);
            await page.goto(torneio.url, { waitUntil: 'networkidle2', timeout: 60000 });

            const clicouEquipas = await page.evaluate(() => {
                const target = Array.from(document.querySelectorAll('a, span, div.rtsLink')).find(el => el.innerText?.trim().toUpperCase() === 'EQUIPAS');
                if (target) { target.click(); return true; }
                return false;
            });

            if (!clicouEquipas) continue;
            await new Promise(r => setTimeout(r, 4000));

            let temProximaPagina = true;
            let memoriaAnterior = "";

            while (temProximaPagina) {
                const linhas = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('table[id*="grid_all_teams"] tbody tr'))
                        .map(tr => ({
                            nome: tr.querySelector('td:nth-child(3)')?.innerText.trim(),
                            cat: tr.querySelector('td:nth-child(2)')?.innerText.trim(),
                            btnId: tr.querySelector('a[mytitle="Ver Jogadores"]')?.id
                        })).filter(e => e.btnId && e.nome);
                });

                const hash = linhas.map(l => l.nome).join('|');
                if (hash === memoriaAnterior) break;
                memoriaAnterior = hash;

                for (const eq of linhas) {
                    const chave = `${eq.nome}|${torneio.nome}|${torneio.tipo}|${eq.cat}`.toLowerCase().trim();
                    const idDB = mapaEquipas[chave] || mapaEquipas[eq.nome.toLowerCase().trim()];
                    if (!idDB) continue;

                    await page.evaluate((id) => document.getElementById(id)?.click(), eq.btnId);
                    await new Promise(r => setTimeout(r, 5000));

                    const plantel = await page.evaluate(() => {
                        const res = [];
                        document.querySelectorAll('table.rgMasterTable').forEach(table => {
                            const ths = Array.from(table.querySelectorAll('th')).map(th => th.innerText.toUpperCase().trim());
                            const idxL = ths.findIndex(t => t.includes('LICEN'));
                            const idxN = ths.findIndex(t => t === 'NOME' || t.includes('JOGADOR'));
                            const idxP = ths.findIndex(t => t.includes('PONTOS'));

                            table.querySelectorAll('tbody tr').forEach(tr => {
                                const tds = tr.querySelectorAll('td');
                                if (tds.length > 2) {
                                    const licenca = tds[idxL]?.innerText.trim();
                                    const nome = tds[idxN]?.innerText.trim();
                                    const pts = parseFloat(tds[idxP]?.innerText.trim().replace(/\./g, '').replace(',', '.')) || 0;
                                    if (/^\d+$/.test(licenca) && nome && nome.toUpperCase() !== "JOGADOR") {
                                        res.push({ nome, fpp_id: licenca, pontos_fpp: pts, updated_at: new Date().toISOString() });
                                    }
                                }
                            });
                        });
                        return res;
                    });

                    if (plantel.length > 0) await upsertJogadores(plantel, idDB);
                }

                const clicouProximo = await page.evaluate(() => {
                    const btn = document.querySelector('input.rgPageNext');
                    if (btn && !btn.classList.contains('rgDisabled')) { btn.click(); return true; }
                    return false;
                });
                if (!clicouProximo) break;
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    } catch (err) {
        console.error("❌ [Liga] Erro Crítico:", err.message);
    } finally {
        await browser.close();
        console.log("🏁 [Liga] Finalizado.");
    }
}

iniciarScraper();