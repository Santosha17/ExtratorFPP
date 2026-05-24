require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function obterCoordenadas(moradaOriginal) {
    try {
        const headers = { 'User-Agent': 'ScoreNacional_App_1.0' };

        // 1. Extrair o Código Postal (agora suporta espaços ex: "2775 - 615")
        const cpMatchRaw = moradaOriginal.match(/\d{4}\s*-\s*\d{3}/);
        const cpMatch = cpMatchRaw ? cpMatchRaw[0].replace(/\s/g, '') : null;

        // 2. Limpar a morada (Corta depois de Portugal e remove S/N, 1º-D, etc)
        let moradaLimpa = moradaOriginal.split('Portugal')[0] + "Portugal";
        moradaLimpa = moradaLimpa.replace(/S\/N/gi, '')
            .replace(/,?\s*\d+º-[a-z]/gi, '')
            .trim();

        // --- TENTATIVA 1: Pesquisa pela morada limpa ---
        let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(moradaLimpa)}`;
        let res = await fetch(url, { headers });
        let data = await res.json();

        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }

        // --- TENTATIVA 2: Falhou? Procurar só pelo Código Postal ---
        if (cpMatch) {
            console.log(`      ↪ Morada confusa. A forçar busca pelo Código Postal: ${cpMatch}...`);
            url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cpMatch}&country=Portugal`;
            res = await fetch(url, { headers });
            data = await res.json();

            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        }

        // --- TENTATIVA 3: Último recurso, forçar "Pino na Cidade" ---
        // Ex: Se a string acabar em "Oeiras", procura "Oeiras, Portugal"
        const partes = moradaOriginal.split(',');
        const cidade = partes[partes.length - 1].trim();

        if (cidade) {
            console.log(`      ↪ A forçar busca apenas pela cidade: ${cidade}...`);
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cidade + ', Portugal')}`;
            res = await fetch(url, { headers });
            data = await res.json();

            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        }

    } catch (e) {
        console.error("Erro a contactar o mapa:", e);
    }

    return { lat: null, lng: null };
}

(async () => {
    console.log("🌍 A procurar torneios sem coordenadas...");

    const res = await fetch(`${SUPABASE_URL}/rest/v1/torneios?lat=is.null&morada=not.is.null&select=id,nome,morada`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    const torneios = await res.json();

    if (!torneios || torneios.length === 0) {
        return console.log("🎉 Todos os torneios já têm coordenadas!");
    }

    console.log(`Encontrados ${torneios.length} torneios para atualizar.\n`);

    for (const torneio of torneios) {
        console.log(`📍 A processar: ${torneio.nome}`);

        const coords = await obterCoordenadas(torneio.morada);

        if (coords.lat && coords.lng) {
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/torneios?id=eq.${torneio.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lat: coords.lat, lng: coords.lng })
            });

            if (updateRes.ok) {
                console.log(`   ✅ Sucesso: [${coords.lat}, ${coords.lng}]`);
            } else {
                console.log(`   ❌ Erro a guardar no Supabase.`);
            }
        } else {
            console.log(`   ⚠️ Desisto. Não encontrei no mapa de maneira nenhuma: ${torneio.morada}`);
        }

        // Delay de 1.5s obrigatório pelo OpenStreetMap
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log("\n🏁 Atualização concluída! Falta pouco para o mapa ficar perfeito.");
})();