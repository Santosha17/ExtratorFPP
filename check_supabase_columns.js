require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function checkColumns() {
    const resMatches = await fetch(`${SUPABASE_URL}/rest/v1/matches?limit=1`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const matchesData = await resMatches.json();
    console.log("Campos da tabela 'matches':", matchesData.length > 0 ? Object.keys(matchesData[0]) : "Tabela vazia");

    const resDetails = await fetch(`${SUPABASE_URL}/rest/v1/match_details?limit=1`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const detailsData = await resDetails.json();
    console.log("Campos da tabela 'match_details':", detailsData.length > 0 ? Object.keys(detailsData[0]) : "Tabela vazia");
}

checkColumns();
