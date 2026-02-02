require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

// Identifies your app to MusicBrainz (Required to avoid IP blocking)
const USER_AGENT = "ZaHouseForensicAuditor/1.0.0 ( dcrutchfield@za.house )";

/**
 * STEP 1 & 2 OF FORENSIC CHAIN: Live Registry Search
 * Fetches real ISWCs and metadata from MusicBrainz
 */
async function performForensicCatalogSearch(artistName) {
    try {
        console.log(`Auditing MusicBrainz for: ${artistName}...`);
        
        // 1. Search for Artist MBID
        const artistUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(artistName)}&fmt=json`;
        const artistRes = await fetch(artistUrl, { headers: { "User-Agent": USER_AGENT } });
        const artistData = await artistRes.json();
        
        if (!artistData.artists || artistData.artists.length === 0) return [];
        const artistId = artistData.artists[0].id;

        // 2. Search for Works (Compositions/ISWCs)
        const worksUrl = `https://musicbrainz.org/ws/2/work?artist=${artistId}&limit=50&fmt=json`;
        const worksRes = await fetch(worksUrl, { headers: { "User-Agent": USER_AGENT } });
        const worksData = await worksRes.json();

        // 3. Transform to Forensic Structure for AI analysis
        return worksData.works.map(work => ({
            title: work.title,
            iswc: work.iswcs?.[0] || "MISSING",
            type: work.type || "Musical Work",
            status: work.iswcs?.[0] ? "ISWC SECURE" : "BROKEN HANDSHAKE"
        }));
    } catch (error) {
        console.error("MusicBrainz API Error:", error);
        return { error: "Failed to connect to global registries." };
    }
}

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // Polling loop to handle AI's tool requests
        while (run.status !== 'completed') {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === "perform_forensic_catalog_search") {
                        const args = JSON.parse(toolCall.function.arguments);
                        const liveResults = await performForensicCatalogSearch(args.artistName);

                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(liveResults)
                        });
                    }
                }
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });
            } else if (run.status === 'failed') {
                throw new Error(run.last_error ? run.last_error.message : "Run failed.");
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit polling
        }

        const messages = await openai.beta.threads.messages.list(thread.id);
        res.json({ response: messages.data[0].content[0].text.value, threadId: thread.id });

    } catch (error) {
        console.error("Audit System Error:", error);
        res.status(500).json({ error: "Forensic logic error. Check server logs." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Institutional Auditor Server live on port ${PORT}`));
