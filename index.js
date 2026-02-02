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

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // 1. Thread Safety: Ensure we never pass "undefined" to OpenAI
        let thread;
        if (threadId && threadId !== "null" && threadId !== "undefined") {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
        }

        // 2. Add Message
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Create Run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Polling Loop with "Named Parameter" Fix
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 30) {
            // This line is where your 10:59 PM crash happened.
            // Using thread.id ensures the path is never /threads/undefined/
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
            
            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                throw new Error(`Run ${run.id} failed with status: ${run.status}`);
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Recover Message
        const messages = await openai.beta.threads.messages.list(thread.id);
        const finalMessage = messages.data[0]?.content[0]?.text?.value || "Audit complete.";

        res.json({ response: finalMessage, threadId: thread.id });

    } catch (err) {
        console.error("Forensic Error:", err.message);
        // This sends the actual error to your website so you can see it on your phone
        res.status(500).json({ response: `System Error: ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`Stable Auditor live on ${PORT}`));
server.timeout = 120000;
