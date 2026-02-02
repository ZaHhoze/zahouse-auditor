require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

// MANDATORY: Update with your real contact email
const USER_AGENT = "ZaHouseForensicAuditor/1.0.0 ( your-email@example.com )";

/**
 * LIVE FORENSIC SEARCH: MusicBrainz API Integration
 * Fetches real ISWCs for the 3-step forensic chain.
 */
async function performForensicCatalogSearch(artistName) {
    try {
        console.log(`[Forensic Protocol] Auditing: ${artistName}...`);
        
        // 1. Resolve Artist Identity (MBID)
        const artistUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(artistName)}&fmt=json`;
        const artistRes = await fetch(artistUrl, { headers: { "User-Agent": USER_AGENT } });
        const artistData = await artistRes.json();
        
        if (!artistData.artists || artistData.artists.length === 0) return [];
        const artistId = artistData.artists[0].id;

        // 2. Resolve Works & ISWCs (Composition Identity)
        const worksUrl = `https://musicbrainz.org/ws/2/work?artist=${artistId}&limit=50&fmt=json`;
        const worksRes = await fetch(worksUrl, { headers: { "User-Agent": USER_AGENT } });
        const worksData = await worksRes.json();

        // 3. Format for Assistant Analysis
        return worksData.works.map(work => ({
            title: work.title,
            iswc: work.iswcs?.[0] || "MISSING",
            status: work.iswcs?.[0] ? "ISWC SECURE" : "BROKEN HANDSHAKE"
        }));
    } catch (error) {
        console.error("Registry Error:", error);
        return { error: "Could not reach global registries." };
    }
}

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // Initialize Session
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // Trigger Run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // Polling Loop with Tool Support
        while (run.status !== 'completed') {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === "perform_forensic_catalog_search") {
                        const args = JSON.parse(toolCall.function.arguments);
                        const results = await performForensicCatalogSearch(args.artistName);

                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(results)
                        });
                    }
                }
                // Submit Findings back to AI
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });
            } else if (run.status === 'failed') {
                throw new Error(`Run Failed: ${run.last_error?.message || "Unknown error"}`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to respect rate limits
        }

        /**
         * SAFETY RETRY LOGIC: Prevents "undefined" by verifying the message exists
         */
        let finalMessage = null;
        for (let i = 0; i < 3; i++) { // Try up to 3 times
            const messageList = await openai.beta.threads.messages.list(thread.id);
            if (messageList.data[0] && messageList.data[0].role === 'assistant') {
                finalMessage = messageList.data[0].content[0].text.value;
                break;
            }
            console.log(`Response pending (Retry ${i+1}/3)...`);
            await new Promise(r => setTimeout(r, 1500)); 
        }

        if (!finalMessage) throw new Error("Assistant response remained undefined after retries.");

        res.json({
            response: finalMessage,
            threadId: thread.id
        });

    } catch (error) {
        console.error("Audit System Error:", error.message);
        res.status(500).json({ error: "Forensic logic error. Please try again." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Institutional Auditor Server live on port ${PORT}`));
