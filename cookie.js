const axios = require("axios");
const cheerio = require("cheerio");
const tough = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const URL = "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4B/Draws";

// create cookie-aware client
const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar }));

function extractHiddenFields($) {
    return {
        _VIEWSTATE: $("#_VIEWSTATE").val() || "",
        _EVENTVALIDATION: $("#_EVENTVALIDATION").val() || "",
        _VIEWSTATEGENERATOR: $("#_VIEWSTATEGENERATOR").val() || ""
    };
}

function findEventTarget($, groupName = "Grupo C") {
    let target = null;

    $("a").each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes(groupName)) {
            const href = $(el).attr("href") || "";
            if (href.includes("__doPostBack")) {
                target = href.split("'")[1];
                return false; // break loop
            }
        }
    });

    return target;
}

async function main() {
    try {
        console.log("Fetching page...");

        // Step 1: GET page
        const res = await client.get(URL);
        const $ = cheerio.load(res.data);

        // Step 2: extract hidden fields
        const hidden = extractHiddenFields($);

        // Step 3: find event target
        const eventTarget = findEventTarget($, "Grupo C");

        if (!eventTarget) {
            console.log("❌ Could not find Grupo C");
            return;
        }

        console.log("✔ Event target:", eventTarget);

        // Step 4: collect ALL form inputs
        let payload = {
            __EVENTTARGET: eventTarget,
            __EVENTARGUMENT: "",
            ...hidden
        };

        $("form input").each((i, el) => {
            const name = $(el).attr("name");
            const value = $(el).val() || "";
            if (name && !payload[name]) {
                payload[name] = value;
            }
        });

        // Step 5: POST back
        console.log("Submitting postback...");

        const res2 = await client.post(URL, new URLSearchParams(payload), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": URL,
                "Origin": "https://fpp.tiepadel.com",
                "User-Agent": "Mozilla/5.0"
            }
        });

        // Step 6: save result
        require("fs").writeFileSync("grupo_c.html", res2.data);

        console.log("✔ Saved to grupo_c.html");

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

main();