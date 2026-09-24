const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://fpp.tiepadel.com/tournaments/OpenSJoaoMadeira26/Draws', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('select[id*=\"drop_tournaments\"]');
    
    // Select M2
    const m2Val = await page.evaluate(() => {
        const sel = document.querySelector('select[id*=\"drop_tournaments\"]');
        return Array.from(sel.options).find(o => o.innerText.includes('Masculinos 2')).value;
    });
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.select('select[id*=\"drop_tournaments\"]', m2Val)
    ]);
    await new Promise(r => setTimeout(r, 2000));

    const matchesComData = await page.evaluate(() => {
        const matches = [];
        
        // 1. Procurar por todos os spans de score
        document.querySelectorAll('span[id*=\"_lbl_score_\"]').forEach(scoreEl => {
            const idParts = scoreEl.id.split('_lbl_score_');
            if (idParts.length !== 2) return;
            const pfx = idParts[0], matchId = idParts[1];
            
            const p1a = document.getElementById(pfx + '_lbl_ply_' + matchId + '_a_1')?.innerText.trim() || '';
            const p2a = document.getElementById(pfx + '_lbl_ply_' + matchId + '_a_2')?.innerText.trim() || '';
            const p1b = document.getElementById(pfx + '_lbl_ply_' + matchId + '_b_1')?.innerText.trim() || '';
            const p2b = document.getElementById(pfx + '_lbl_ply_' + matchId + '_b_2')?.innerText.trim() || '';
            
            // Onde está o span.date mais próximo deste match?
            // Vamos testar:
            // Opção A: No parentTd do score ou siblings
            const parentTd = scoreEl.closest('td');
            const parentTr = scoreEl.closest('tr');
            
            // Opção B: Por proximidade geométrica (bounding client rect)
            const scoreRect = scoreEl.getBoundingClientRect();
            
            let bestDate = '';
            let bestDist = 999999;
            
            document.querySelectorAll('span.date, span[id*=\"lbl_ply_\"]').forEach(dEl => {
                const txt = dEl.innerText.trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(txt)) {
                    const dRect = dEl.getBoundingClientRect();
                    // O span da data deve estar na mesma coluna horizontal (aproximadamente mesmo X ou ligeiramente antes) e mesmo Y
                    const distX = Math.abs(dRect.left - scoreRect.left);
                    const distY = Math.abs(dRect.top - scoreRect.top);
                    const dist = Math.sqrt(distX * distX + distY * distY);
                    
                    if (dist < bestDist && distX < 150 && distY < 200) {
                        bestDist = dist;
                        bestDate = txt;
                    }
                }
            });
            
            matches.push({
                matchId,
                equipaA: [p1a, p2a].filter(Boolean).join(' / '),
                equipaB: [p1b, p2b].filter(Boolean).join(' / '),
                score: scoreEl.innerText.trim(),
                dataHoraCampo: bestDate,
                distancia: bestDist
            });
        });
        
        return matches.filter(m => m.equipaA || m.equipaB).slice(0, 10);
    });

    console.log(JSON.stringify(matchesComData, null, 2));
    await browser.close();
})();
