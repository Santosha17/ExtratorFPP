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

        // Procurar todos os elementos folha que contêm datas/horários (ex: 2026-09-)
        const scheduleLeafElements = Array.from(document.querySelectorAll('*'))
            .filter(el => {
                const txt = el.innerText ? el.innerText.trim() : '';
                return /^\d{4}-\d{2}-\d{2},\s*(?:Starting at|Not before)?\s*\d{1,2}:\d{2}/i.test(txt) && el.children.length === 0;
            })
            .slice(0, 5)
            .map(el => {
                const parentTd = el.closest('td');
                const parentTr = el.closest('tr');
                const prevTr = parentTr?.previousElementSibling;
                const nextTr = parentTr?.nextElementSibling;

                return {
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    text: el.innerText.trim(),
                    parentTdClass: parentTd?.className,
                    parentTdId: parentTd?.id,
                    parentTrId: parentTr?.id,
                    parentTrIndex: parentTr ? Array.from(parentTr.parentElement?.children || []).indexOf(parentTr) : -1,
                    // Procurar scores ou jogadores perto desta TR
                    scorePerto: parentTr?.querySelector('[id*="_lbl_score_"]')?.id || nextTr?.querySelector('[id*="_lbl_score_"]')?.id || prevTr?.querySelector('[id*="_lbl_score_"]')?.id,
                    scorePertoText: parentTr?.querySelector('[id*="_lbl_score_"]')?.innerText || nextTr?.querySelector('[id*="_lbl_score_"]')?.innerText || prevTr?.querySelector('[id*="_lbl_score_"]')?.innerText,
                    jogadoresNaMesmaTrOuVizinhas: Array.from(parentTr?.querySelectorAll('[id*="_lbl_ply_"]') || []).map(p => p.innerText.trim())
                };
            });

        return { scheduleLeafElements };
    });

    console.log("\n==================== RESULTADO DA INSPEÇÃO ====================");
    console.log(JSON.stringify(resultado, null, 2));
    console.log("===============================================================");

    await browser.close();
})();
