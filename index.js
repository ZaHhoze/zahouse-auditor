require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

async function performForensicCatalogSearch(artistName) {
    console.log(`[STABLE SCAN] ${artistName}`);
    return [
        { title: "Asset 01", iswc: "T-010.556.789-0", status: "ISWC SECURE" },
        { title: "Asset 02", iswc: "MISSING", status: "BROKEN HANDSHAKE" }
    ];
}

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // 1. Thread Management
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();
        if (!thread.id) throw new Error("Could not initialize thread.");

        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 2. Create the Run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });
        if (!run.id) throw new Error("Could not initialize run.");

        // 3. Polling Loop with Safety Check
        let maxAttempts = 30; 
        while (run.status !== 'completed' && maxAttempts > 0) {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = toolCalls.map(tc => ({
                    tool_call_id: tc.id,
                    output: JSON.stringify([
                        { title: "Asset 01", iswc: "T-010.556.789-0", status: "ISWC SECURE" },
                        { title: "Asset 02", iswc: "MISSING", status: "BROKEN HANDSHAKE" }
                    ])
                }));
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });
            }
            
            if (run.status === 'failed') throw new Error(run.last_error?.message || "Run failed");
            
            await new Promise(r => setTimeout(r, 1000));
            maxAttempts--;
        }

        // 4. Final Message Recovery
        const messages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0]?.content[0]?.text?.value || "Audit complete.";

        res.json({ response: lastMessage, threadId: thread.id });

    } catch (err) {
        console.error("Forensic Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 8080; // Railway often uses 8080
const server = app.listen(PORT, () => console.log(`Stable Auditor live on ${PORT}`));
server.timeout = 120000;
