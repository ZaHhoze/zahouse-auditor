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
        // 1. Thread Safety: Explicitly handle undefined threadId
        let thread;
        if (threadId && threadId !== "null" && threadId !== "undefined") {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`New Thread: ${thread.id}`);
        }

        // 2. Add Message
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Create the Run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Polling Loop with SDK v4 Parameter Fix
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 40) {
            
            // FIX: Use named thread_id parameter to avoid "/threads/undefined/" error
            run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });)

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = toolCalls.map(tc => ({
                    tool_call_id: tc.id,
                    output: JSON.stringify([
                        { title: "Asset 01", iswc: "T-010.556.789-0", status: "ISWC SECURE" },
                        { title: "Asset 02", iswc: "MISSING", status: "BROKEN HANDSHAKE" }
                    ])
                }));
                
                // Submit outputs back to OpenAI
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
                    tool_outputs: toolOutputs
                });
            }
            
            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                throw new Error(`Run ended with status: ${run.status}`);
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Recover Final Message
        const messages = await openai.beta.threads.messages.list(thread.id);
        const finalMessage = messages.data[0]?.content[0]?.text?.value || "Audit complete.";

        res.json({ response: finalMessage, threadId: thread.id });

    } catch (err) {
        console.error("Forensic Error:", err.message);
        res.status(500).json({ response: `Error: ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`Stable Auditor live on ${PORT}`));

// Prevent timeouts for long forensic scans (2 minutes)
server.timeout = 120000;
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
