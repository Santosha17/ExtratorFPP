require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const pdf = require('pdf-parse-new');
const cheerio = require('cheerio');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

const ANO_ATUAL = new Date().getFullYear();

const mesesMap = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

function getValidDate(mes, dia) {
    if (!mes || !dia) return null;
    const y = ANO_ATUAL;
    const m = parseInt(mes);
    let d = parseInt(dia);

    let dateObj = new Date(y, m - 1, d);
    if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
        dateObj = new Date(y, m, 0);
        d = dateObj.getDate();
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function upsertTorneio(payload) {
    if (!payload.nome) return;
    const url = `${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`;
    try {
        await axios.post(url, payload, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            }
        });
        console.log(`✅ Salvo: ${payload.nome.substring(0, 30)}... | Prize: ${payload.premio_monetario || '0€'}`);
    } catch (e) {
        console.error(`❌ Erro em ${payload.nome}:`, e.response?.data || e.message);
    }
}

(async () => {
    try {
        console.log("🔍 A carregar PDF da FPP...");
        const { data: html } = await axios.get("https://fppadel.pt/formacao/calendario/");
        const $ = cheerio.load(html);
        const pdfUrl = $('a[href$=".pdf"]').first().attr('href');

        if (!pdfUrl) throw new Error("Link do PDF não encontrado!");

        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfData = await pdf(response.data);
        const linhas = pdfData.text.split('\n');

        console.log("🤖 A extrair TODAS as colunas...\n");

        for (let linha of linhas) {
            let L = linha.trim();
            if (L.length < 10) continue;

            const regex = /^([A-ZÇ]+)\s+([\d\s\/\,ae\-]+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)?)\s+([A-Z]{2,5})\s+([A-Z]{2,5})\s+(.+)$/i;
            const match = L.match(regex);

            if (match) {
                const mesString = match[1].toLowerCase().trim();
                const diasString = match[2].trim();
                const tipo = match[3].toUpperCase().trim();
                const div = match[4].toUpperCase().trim();
                const restoDaLinha = match[5].trim(); // Aqui está o bolo todo

                if (['JA', 'TR', 'AG'].includes(div)) continue; // Ignorar cursos

                const mesNumero = mesesMap[mesString];
                if (!mesNumero) continue;

                const numeros = diasString.replace(/[^0-9]/g, ' ').trim().split(/\s+/);
                if (numeros.length === 0 || numeros[0] === '') continue;

                let diaInicio = numeros[0];
                let diaFim = numeros.length > 1 ? numeros[numeros.length - 1] : null;
                let mesFim = mesNumero;

                if (diasString.includes('/') && numeros.length >= 2) {
                    mesFim = String(numeros[1]).padStart(2, '0');
                    diaFim = null;
                }

                const dataInicio = getValidDate(mesNumero, diaInicio);
                const dataFimStr = diaFim ? getValidDate(mesFim, diaFim) : dataInicio;

                // ==================================================
                // 🪄 O BISTURI MÁGICO: CORTAR A CAUDA DA LINHA
                // ==================================================
                let nomeTorneio = restoDaLinha;
                let categorias = null;
                let classe = null;
                let prizeMoney = null;
                let local = null;
                let organizacao = null;

                // 1. Procurar as Categorias (F1 a F6; M1 a M6 ou Jovens S12... ou VET)
                const catRegex = /(F\d\s*a\s*F\d;\s*M\d\s*a\s*M\d(?:\s*\/\s*FIP\s*M\s*&\s*F)?|M\s*&\s*F:\s*[S\d,\s*e]+|VET\s*M&F\s*\+\d+\s*a\s*\+\d+)/i;
                const catMatch = restoDaLinha.match(catRegex);

                if (catMatch) {
                    categorias = catMatch[1].trim();
                    const splitPoint = restoDaLinha.indexOf(categorias);

                    // O que está ANTES da categoria é o Nome
                    nomeTorneio = restoDaLinha.substring(0, splitPoint).replace(/[\s-]+$/, '').trim();

                    // O que está DEPOIS da categoria é a Classe, Prize, Local e Org
                    let tail = restoDaLinha.substring(splitPoint + categorias.length).trim();

                    // 2. Extrair a Classe (ex: 2.000 ou 10.000 / Continental)
                    const classeMatch = tail.match(/^(\d{1,3}(?:\.\d{3})*(?:\s*\/\s*[A-Za-z]+)?)/);
                    if (classeMatch) {
                        classe = classeMatch[1];
                        tail = tail.substring(classeMatch[0].length).trim();
                    }

                    // 3. Extrair Prize Money (qualquer coisa com o símbolo €)
                    const prizeMatch = tail.match(/^(\S*€)/);
                    if (prizeMatch) {
                        prizeMoney = prizeMatch[1].replace(/[^0-9.,€]/g, ''); // Remove lixo como '´'
                        tail = tail.substring(prizeMatch[0].length).trim();
                    }

                    // 4. Extrair Local e Organização (A primeira palavra costuma ser a Cidade/Local)
                    if (tail.length > 0) {
                        const words = tail.split(' ');
                        local = words[0]; // Ex: "Cacém" ou "Sintra"
                        organizacao = words.slice(1).join(' ').trim(); // Ex: "Padel Campo Grande"
                    }
                }

                // Gerar ID
                const rawId = `${dataInicio}-${nomeTorneio}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const cleanFppId = rawId.substring(0, 50).replace(/-+$/g, '');

                await upsertTorneio({
                    fpp_id: cleanFppId,
                    nome: nomeTorneio,
                    tipo: tipo,
                    escalao: div,
                    data_inicio: dataInicio,
                    data_fim: dataFimStr,
                    categorias: categorias,           // NOVA COLUNA
                    classe: classe,                   // NOVA COLUNA
                    premio_monetario: prizeMoney,     // JÁ TINHAS
                    clube_morada: local,              // JÁ TINHAS
                    clube_nome: organizacao,          // JÁ TINHAS
                    updated_at: new Date().toISOString()
                });
            }
        }

        console.log(`\n🏁 Sincronização Perfeita Concluída!`);

    } catch (e) { console.error("Erro fatal:", e.message); }
})();