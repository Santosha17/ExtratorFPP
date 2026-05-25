require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

// CORREÇÃO: Tratamento robusto da importação do pdf-parse
const pdfLibrary = require('pdf-parse');
const pdf = (typeof pdfLibrary === 'function') ? pdfLibrary : pdfLibrary.default;

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function upsertTorneio(payload) {
    if (!payload.nome || payload.nome.length < 5) return;

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
        if (!res.ok) console.error(`❌ Erro DB [${payload.fpp_id}]: ${await res.text()}`);
        else console.log(`✅ Adicionado: ${payload.nome.substring(0, 25)}...`);
    } catch (e) { console.error("Erro na BD:", e.message); }
}

(async () => {
    try {
        console.log("🔍 A procurar o PDF no site da FPP...");
        const { data: html } = await axios.get("https://fppadel.pt/formacao/calendario/");
        const $ = cheerio.load(html);

        // Encontra o PDF
        const pdfUrl = $('a[href$=".pdf"]').first().attr('href');
        if (!pdfUrl) throw new Error("Não encontrei o PDF na página.");

        console.log(`⬇️ PDF encontrado: ${pdfUrl}. A descarregar...`);
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });

        console.log("📖 A processar PDF...");
        // Agora, com o tratamento acima, esta linha não dará erro
        const pdfData = await pdf(response.data);

        const lines = pdfData.text.split('\n');

        console.log("🤖 A processar torneios...");

        for (let line of lines) {
            line = line.trim();
            // Limpa aspas e divide por vírgula (formato comum de CSV dentro de PDFs)
            const row = line.replace(/"/g, '').split(',');

            // Verifica se a linha tem dados (ex: a primeira coluna tem data "DD/MM")
            if (row.length >= 3 && row[0].match(/\d{2}/)) {

                const data = row[0];
                const nome = row[2];
                // Se a coluna 5 estiver vazia, usa a 3, ou um valor padrão
                const local = row[5] || row[3] || "A definir";

                await upsertTorneio({
                    fpp_id: nome.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    nome: nome.trim(),
                    clube_nome: local.trim(),
                    data_inicio: data.trim(),
                    updated_at: new Date().toISOString()
                });
            }
        }
        console.log("🏁 Sincronização concluída!");

    } catch (e) {
        console.error("❌ Erro fatal:", e.message);
    }
})();