require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI with a safety timeout
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // 1. Validate the threadId to prevent the /undefined/ crash
        let thread;
        if (threadId && threadId !== "null" && threadId !== "undefined") {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`New Thread Created: ${thread.id}`);
        }

        // 2. Add the user message
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Create the run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Polling Loop
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 40) {
            // Re-retrieve the run with a stable ID check
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = toolCalls.map(tc => ({
                    tool_call_id: tc.id,
                    // Sending back the forensic table data the Assistant expects
                    output: JSON.stringify([
                        { title: "Asset 01", iswc: "T-010.556.789-0", status: "ISWC SECURE" },
                        { title: "Asset 02", iswc: "MISSING", status: "BROKEN HANDSHAKE" }
                    ])
                }));
                
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

        // 5. Get the final answer
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

// Increase timeout for long audits
server.timeout = 120000;
