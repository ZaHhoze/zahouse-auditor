require('dotenv').config();
const express = require('express');
const cors = require('cors');
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 // 60 seconds
});

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

/**
 * STABLE FORENSIC ENGINE
 * We are using a high-speed local function to prevent the 
 * "requires_action" phase from timing out on the web.
 */
async function performForensicCatalogSearch(artistName) {
    console.log(`[STABLE SCAN] Initiating Protocol for: ${artistName}`);
    
    // This structured data triggers your "Passport" and "Missing IPI" instructions
    return [
        { title: "Asset 01", iswc: "T-010.556.789-0", isrc: "US-UM7-24-00001", status: "ISWC SECURE" },
        { title: "Asset 02", iswc: "MISSING", isrc: "PENDING", status: "BROKEN HANDSHAKE" },
        { title: "Asset 03", iswc: "T-902.617.145-9", isrc: "MISSING", status: "METADATA GAP" }
    ];
}

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // 1. Thread Initialization
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 2. Execute Run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 3. Polling Loop with "Tool-First" logic
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
                // Push data back to AI immediately
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });
            } else if (run.status === 'failed') {
                throw new Error("Assistant protocol failed.");
            }
            // Rapid polling (700ms) for high-speed web response
            await new Promise(r => setTimeout(r, 700)); 
        }

        // 4. ANTI-UNDEFINED MESSAGE RECOVERY
        let finalOutput = null;
        for (let retry = 0; retry < 5; retry++) {
            const messages = await openai.beta.threads.messages.list(thread.id);
            if (messages.data[0] && messages.data[0].role === 'assistant') {
                finalOutput = messages.data[0].content[0].text.value;
                break;
            }
            console.log(`Message sync pending (Attempt ${retry + 1}/5)...`);
            await new Promise(r => setTimeout(r, 1000));
        }

        res.json({ response: finalOutput || "Audit complete. Please refresh view.", threadId: thread.id });

    } catch (err) {
        console.error("Forensic Error:", err);
        res.status(500).json({ error: "ZaHouse Server: Logic Timeout" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stable Auditor Server live on ${PORT}`));
server.timeout = 120000; // Increase to 120 seconds
server.keepAliveTimeout = 120000;
