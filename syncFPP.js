require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

// CORREÇÃO: Tratamento robusto da importação do pdf-parse
const pdfLibrary = require('pdf-parse-new');
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

        const pdfUrl = $('a[href$=".pdf"]').first().attr('href');
        if (!pdfUrl) throw new Error("Não encontrei o PDF na página.");

        console.log(`⬇️ PDF encontrado: ${pdfUrl}. A descarregar...`);
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });

        console.log("📖 A processar PDF...");
        const pdfData = await pdf(response.data);
        const lines = pdfData.text.split('\n');

        console.log("🤖 A processar torneios...");

        // Mapeamento de meses em português para números
        const meses = {
            'JANEIRO': '01', 'FEVEREIRO': '02', 'MARÇO': '03', 'MARCO': '03',
            'ABRIL': '04', 'MAIO': '05', 'JUNHO': '06', 'JULHO': '07',
            'AGOSTO': '08', 'SETEMBRO': '09', 'OUTUBRO': '10', 'NOVEMBRO': '11', 'DEZEMBRO': '12'
        };

        let mesAtual = '01'; // Começa em Janeiro por defeito

        for (let line of lines) {
            line = line.replace(/"/g, '').trim();
            if (line.length < 5) continue;

            // 1. Deteção de Mês: Verifica se a linha indica uma mudança de mês
            const palavrasLinha = line.toUpperCase().split(' ');
            if (meses[palavrasLinha[0]]) {
                mesAtual = meses[palavrasLinha[0]];
            }

            // 2. Extração do Torneio
            // Procura padrões como "FEVEREIRO 6 a 8 CIR JOV II Open Jovens Dezporvinte..."
            // Ou "6 a 8 CIR JOV..."
            const regexTorneio = /^(?:[A-ZÇ]+\s)?(\d{1,2})\s*(?:a|a|A|-)\s*\d{1,2}\s+(?:CIR|FPP|ABS|VET|JOV|LIGA|FOR|OR).*?\s+(?:CIR|FPP|ABS|VET|JOV|LIGA|FOR|OR)?\s*(.*?)(?:\sM\s*&\s*F|\sF\s*&\s*M|\sM\s*|\sF\s*|$)/;
            const match = line.match(regexTorneio);

            if (match) {
                const diaInicio = match[1].padStart(2, '0');
                const nome = match[2].trim();

                // Limpeza extra para evitar apanhar cabeçalhos perdidos
                if(nome && nome.length > 5 && !nome.includes("M & F") && !nome.includes("The following table")) {

                    // Formata a data para a base de dados (YYYY-MM-DD)
                    const dataFormatada = `2026-${mesAtual}-${diaInicio}`;

                    await upsertTorneio({
                        fpp_id: nome.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50),
                        nome: nome,
                        // No PDF é difícil extrair o clube de forma fiável nesta linha,
                        // enviamos null e depois o teu outro scraper que vai ao link atualiza isto
                        clube_nome: null,
                        data_inicio: dataFormatada,
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }
        console.log("🏁 Sincronização concluída!");

    } catch (e) {
        console.error("❌ Erro fatal:", e.message);
    }
})();