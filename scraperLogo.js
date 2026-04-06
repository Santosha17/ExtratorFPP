const puppeteer = require('puppeteer');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = "https://eezbrdjncjjgmjueftgg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlemJyZGpuY2pqZ21qdWVmdGdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzNzEyMywiZXhwIjoyMDkwNzEzMTIzfQ.KDGRw0MClRKxYUyOMiglb8VYGn8uHii79i-3hYkAWlc";
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

// --- FUNÇÃO: ATUALIZAR LOGO DA EQUIPA ---
async function registarLogoEquipa(nome, zona, tipo, categoria, grupo, logo_url) {
    if (!nome || nome.includes("Tba")) return;

    const payload = {
        nome: nome.trim(),
        zona,
        tipo,
        categoria,
        grupo,
        logo_url: logo_url || null
    };

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/equipas`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates' // Fundamental para atualizar o logo se a equipa já existir
            },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error(`   ⚠️ Erro ao guardar logo de ${nome}:`, error.message);
    }
}

// --- MOTOR DO PUPPETEER ---
(async () => {
    console.log("🚀 A iniciar Operação Logo Hunter...");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    try {
        for (const torneio of TORNEIOS_LIGA) {
            console.log(`\n🌍 ZONA: ${torneio.nome} | ${torneio.tipo}`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { timeout: 10000 });
            } catch (e) {
                continue;
            }

            const categorias = await page.evaluate(() => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options)
                    .filter(opt => opt.value !== "0")
                    .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                console.log(`  🎾 Categoria: ${cat.nome}`);

                try {
                    await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                    await page.select('#drop_tournaments', cat.valor);
                    await new Promise(r => setTimeout(r, 3000));

                    // Ir para ENCONTROS
                    await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const btn = links.find(l => l.innerText.trim() === 'ENCONTROS');
                        if (btn) btn.click();
                    });
                    await new Promise(r => setTimeout(r, 3000));

                    const grupos = await page.evaluate(() => {
                        return Array.from(document.querySelectorAll('a'))
                            .map(l => l.innerText.trim())
                            .filter(t => t.includes("Grupo") || t === "Main");
                    });

                    for (const grupo of grupos) {
                        await page.evaluate((g) => {
                            const link = Array.from(document.querySelectorAll('a')).find(l => l.innerText.trim() === g);
                            if (link) link.click();
                        }, grupo);
                        await new Promise(r => setTimeout(r, 3000));

                        const numJogos = await page.evaluate(() => {
                            const ths = Array.from(document.querySelectorAll('th'));
                            const idx = ths.findIndex(th => th.innerText.trim() === 'Ações');
                            return document.querySelectorAll(`tr td:nth-child(${idx + 1}) a`).length;
                        });

                        for (let i = 0; i < numJogos; i++) {
                            // Clicar no botão de detalhe do jogo
                            await page.evaluate((index) => {
                                const ths = Array.from(document.querySelectorAll('th'));
                                const idx = ths.findIndex(th => th.innerText.trim() === 'Ações');
                                const btns = document.querySelectorAll(`tr td:nth-child(${idx + 1}) a`);
                                if (btns[index]) btns[index].click();
                            }, i);

                            await new Promise(r => setTimeout(r, 4000));

                            // Extrair Logos
                            const logos = await page.evaluate(() => {
                                const ths = Array.from(document.querySelectorAll('th'));
                                const validHeaders = ths.map(th => th.innerText.trim()).filter(t => t.length > 1);

                                // A data costuma ser a primeira coluna com texto útil nos cabeçalhos de detalhe
                                const dataIdx = validHeaders.findIndex(t => t.toLowerCase().includes('data'));
                                const hName = validHeaders[dataIdx + 1];
                                const aName = validHeaders[dataIdx + 2];

                                // Encontrar as tags IMG dentro dos headers das equipas
                                const allThs = Array.from(document.querySelectorAll('th'));
                                const hHeader = allThs.find(th => th.innerText.includes(hName));
                                const aHeader = allThs.find(th => th.innerText.includes(aName));

                                return {
                                    home_team: hName,
                                    away_team: aName,
                                    home_logo: hHeader?.querySelector('img')?.src || null,
                                    away_logo: aHeader?.querySelector('img')?.src || null
                                };
                            });

                            if (logos.home_team) {
                                console.log(`    🛡️ A processar logos: ${logos.home_team} vs ${logos.away_team}`);
                                await registarLogoEquipa(logos.home_team, torneio.nome, torneio.tipo, cat.nome, grupo, logos.home_logo);
                                await registarLogoEquipa(logos.away_team, torneio.nome, torneio.tipo, cat.nome, grupo, logos.away_logo);
                            }

                            // Voltar para a lista
                            await page.evaluate(() => {
                                const btn = Array.from(document.querySelectorAll('a')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                if (btn) btn.click();
                            });
                            await new Promise(r => setTimeout(r, 3000));
                        }
                    }
                } catch (catError) {
                    continue;
                }
            }
        }
    } finally {
        await browser.close();
        console.log("\n🏁 Operação Concluída!");
    }
})();