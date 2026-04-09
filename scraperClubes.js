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

const torneiosParaCorrer = TORNEIOS_LIGA.filter(t => {
    const filterTipo = TIPO_ALVO ? t.tipo === TIPO_ALVO : true;
    const filterZona = ZONA_ALVO ? t.nome === ZONA_ALVO : true;
    return filterTipo && filterZona;
});

const cacheClubesVerificados = new Set();

async function guardarClubesNoSupabase(clubesExtraidos) {
    if (!clubesExtraidos || clubesExtraidos.length === 0) return;

    for (const nomeClube of clubesExtraidos) {
        if (cacheClubesVerificados.has(nomeClube)) continue;

        try {
            const urlSearch = `${SUPABASE_URL}/rest/v1/clubes?nome=eq.${encodeURIComponent(nomeClube)}`;
            const resSearch = await fetch(urlSearch, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const clubesDb = await resSearch.json();

            if (!clubesDb || clubesDb.length === 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/clubes`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ nome: nomeClube })
                });
                console.log(`   🏠 Novo Clube Adicionado: ${nomeClube}`);
            }
            cacheClubesVerificados.add(nomeClube);
        } catch (error) {
            console.error(`   ❌ Falha ao processar o clube ${nomeClube}:`, error.message);
        }
    }
}

(async () => {
    console.log(`🚀 A iniciar Extrator ARRASTÃO de Clubes (À prova de Loops) - Filtros: ${ZONA_ALVO || 'Todas as Zonas'} | ${TIPO_ALVO || 'Todos os Tipos'}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        for (const torneio of torneiosParaCorrer) {
            console.log(`\n==================================================`);
            console.log(`🌍 A EXTRAIR CLUBES DA: ${torneio.nome} | ${torneio.tipo}`);
            console.log(`==================================================`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });

                const clicouEquipas = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a, span, div'));
                    const equipasLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'EQUIPAS');
                    if (equipasLink) {
                        equipasLink.click();
                        return true;
                    }
                    return false;
                });

                if (!clicouEquipas) {
                    console.log("   ⚠️ Aba 'Equipas' não encontrada. A saltar...");
                    continue;
                }

                await new Promise(r => setTimeout(r, 2000));
                await page.waitForSelector('table tr', { timeout: 8000 }).catch(() => {});

                // ✨ O DETETOR DE PÁGINAS (Baseado na tua imagem!)
                let totalDePaginas = await page.evaluate(() => {
                    const textoTotal = document.body.innerText;
                    // Procura o texto exato "items in X pages"
                    const match = textoTotal.match(/items in (\d+) pages/i);
                    if (match) {
                        return parseInt(match[1], 10); // Apanha o número X
                    }
                    return 1; // Se não encontrar texto nenhum, assume que é só 1 página
                });

                console.log(`   ℹ️ O site reporta ter exatamente ${totalDePaginas} página(s). A extrair...`);

                const todosOsClubesDaZona = new Set();

                // O NOVO LOOP SEGURO: Vai exatamente de 1 até ao número total de páginas
                for (let paginaAtual = 1; paginaAtual <= totalDePaginas; paginaAtual++) {
                    console.log(`   📄 A ler Clubes da Página ${paginaAtual} de ${totalDePaginas}...`);

                    const clubesNestaPagina = await page.evaluate(() => {
                        const arr = [];
                        const tables = document.querySelectorAll('table');

                        tables.forEach(table => {
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim().toUpperCase());
                            const deIndex = headers.indexOf('DE');

                            if (deIndex === -1) return;

                            table.querySelectorAll('tr').forEach(tr => {
                                const tds = tr.querySelectorAll('td');
                                if (tds.length > deIndex) {
                                    const nomeDoClube = tds[deIndex].innerText.trim();
                                    if (nomeDoClube && nomeDoClube !== '-' && nomeDoClube.toUpperCase() !== 'DE') {
                                        arr.push(nomeDoClube);
                                    }
                                }
                            });
                        });
                        return arr;
                    });

                    clubesNestaPagina.forEach(c => todosOsClubesDaZona.add(c));

                    // Se ainda não chegámos à última página, clica no botão para avançar!
                    if (paginaAtual < totalDePaginas) {
                        await page.evaluate(() => {
                            const btnNext = document.querySelector('input.rgPageNext, input[title="Next Page"]');
                            if (btnNext) {
                                btnNext.click();
                            }
                        });
                        await new Promise(r => setTimeout(r, 3500)); // Espera que a tabela carregue
                    }
                }

                const arrayFinal = Array.from(todosOsClubesDaZona);
                console.log(`   🔎 Encontrados ${arrayFinal.length} clubes únicos nesta Zona. A guardar...`);
                await guardarClubesNoSupabase(arrayFinal);

            } catch (e) {
                console.error(`   ❌ Erro ao ler a zona ${torneio.nome}:`, e.message);
            }
        }

        console.log(`\n🎉 Processo Pente Fino Arrastão de Clubes Finalizado! Base de dados blindada!`);

    } catch (err) {
        console.error("❌ Erro catastrófico no motor principal:", err);
    } finally {
        await browser.close();
        console.log("🛑 Browser fechado.");
    }
})();