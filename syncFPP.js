require('dotenv').config();
const axios = require('axios');
const pdf = require('pdf-parse-new');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function upsertTorneio(payload) {
    if (!payload.nome) return;
    const url = `${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) console.log(`✅ Adicionado: ${payload.nome.substring(0, 20)} | Esc.: ${payload.escalao}`);
    } catch (e) { console.error("Erro BD:", e.message); }
}

(async () => {
    try {
        console.log("🔍 A carregar PDF...");
        const { data: html } = await axios.get("https://fppadel.pt/formacao/calendario/");
        const $ = cheerio.load(html);
        const pdfUrl = $('a[href$=".pdf"]').first().attr('href');
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfData = await pdf(response.data);
        const linhas = pdfData.text.split('\n');

        console.log("🤖 A processar torneios com filtro de Escalão (DIV)...");

        for (let linha of linhas) {
            let L = linha.trim();
            if (L.length < 10) continue;

            // Regex captura: DATA, TIPO, DIV, RESTO
            // Ex: "20/02 CIR ABS 4º Open..."
            const regex = /(?<data>\d{1,2}(?:\sa\s\d{1,2})?)\s+(?<tipo>[A-Z]{3,})\s+(?<div>[A-Z]{2,3})\s+(?<nome>.+)/;
            const match = L.match(regex);

            if (match) {
                const { data, tipo, div, nome } = match.groups;

                // FILTRO: Ignora se a DIV for JA, TR ou AG
                if (['JA', 'TR', 'AG'].includes(div.toUpperCase())) continue;

                // Gravar na Base de Dados com o novo mapeamento
                await upsertTorneio({
                    fpp_id: nome.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50),
                    nome: nome.trim(),
                    tipo: tipo,
                    escalao: div, // Agora mapeado para a nova coluna 'escalao'
                    data_inicio: '2026-01-01', // O enriquecimento vai atualizar isto depois
                    updated_at: new Date().toISOString()
                });
            }
        }
        console.log("🏁 Sincronização concluída!");
    } catch (e) { console.error("Erro:", e.message); }
})();