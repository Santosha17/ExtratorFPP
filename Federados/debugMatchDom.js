const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    console.log("🔍 A aceder ao torneio Open São João da Madeira para inspecionar horários no DOM...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    const url = "https://fpp.tiepadel.com/tournaments/OpenSJoaoMadeira26/Draws";
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('select[id$="drop_tournaments"], #drop_tournaments', { timeout: 15000 });

    // Seleciona Masculinos 2
    const m2Value = await page.evaluate(() => {
        const select = document.querySelector('select[id$="drop_tournaments"], #drop_tournaments');
        const opt = Array.from(select.options).find(o => o.innerText.toLowerCase().includes('masculinos 2'));
        return opt ? opt.value : select.options[1].value;
    });

    console.log("🎾 A selecionar categoria Masculinos 2 (valor:", m2Value, ")...");
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        page.select('select[id$="drop_tournaments"], #drop_tournaments', m2Value)
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Inspecionar todos os elementos relacionados com partidas e horários
    const resultado = await page.evaluate(() => {
        const info = [];

        // 1. Procurar por Fernando Júlio
        const spans = Array.from(document.querySelectorAll('span, a, div, td'));
        const fjEl = spans.find(s => s.innerText && s.innerText.toLowerCase().includes('fernando j'));

        let matchContainer = null;
        let matchId = null;

        if (fjEl) {
            info.push({ tipo: 'Elemento Jogador Encontrado', tag: fjEl.tagName, id: fjEl.id, class: fjEl.className, text: fjEl.innerText });
            // Se o id for do tipo ..._lbl_ply_XXXX_a_1
            const m = fjEl.id.match(/_lbl_ply_([^_]+)_/);
            if (m) matchId = m[1];
            matchContainer = fjEl.closest('td, tr, table, .match, .cell');
        }

        // 2. Procurar todos os elementos com esse matchId no id
        let elementosComMatchId = [];
        if (matchId) {
            elementosComMatchId = Array.from(document.querySelectorAll(`[id*="${matchId}"]`)).map(el => ({
                id: el.id,
                tag: el.tagName,
                class: el.className,
                text: el.innerText.trim(),
                title: el.getAttribute('title'),
                parentTag: el.parentElement?.tagName,
                parentClass: el.parentElement?.className
            }));
        }

        // 3. Procurar quaisquer elementos que contenham datas, horas (ex: HH:MM ou DD/MM ou \d{1,2}:\d{2}) na página
        const elementosComHorario = Array.from(document.querySelectorAll('span, a, div, td, b, p'))
            .filter(el => {
                const txt = el.innerText ? el.innerText.trim() : '';
                return /\b\d{1,2}:\d{2}\b/.test(txt) && txt.length < 50;
            })
            .slice(0, 15)
            .map(el => ({
                id: el.id,
                tag: el.tagName,
                class: el.className,
                text: el.innerText.trim(),
                parentTag: el.parentElement?.tagName,
                parentId: el.parentElement?.id,
                parentClass: el.parentElement?.className
            }));

        // 4. Inspecionar a estrutura do parentTd do score
        const scoreEl = document.querySelector('span[id*="_lbl_score_"]');
        let parentTdInfo = null;
        if (scoreEl) {
            const td = scoreEl.closest('td');
            if (td) {
                parentTdInfo = {
                    tdId: td.id,
                    tdClass: td.className,
                    tdHtml: td.innerHTML.slice(0, 500),
                    prevTdHtml: td.previousElementSibling?.innerHTML?.slice(0, 300) || null,
                    parentTrHtml: td.parentElement?.innerHTML?.slice(0, 500) || null
                };
            }
        }

        return {
            matchId,
            info,
            elementosComMatchId,
            elementosComHorario,
            parentTdInfo
        };
    });

    console.log("\n==================== RESULTADO DA INSPEÇÃO ====================");
    console.log(JSON.stringify(resultado, null, 2));
    console.log("===============================================================");

    await browser.close();
})();
