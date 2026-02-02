require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post('/audit', async (req, res) => {
    // We kept 'threadId' variable name to match your website
    const { message, threadId } = req.body;

    try {
        // 1. Thread Setup (With Logging)
        let thread;
        if (threadId && threadId.startsWith('thread_')) {
            console.log(`Resuming Thread: ${threadId}`);
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`Created New Thread: ${thread.id}`);
        }

        // 2. Add Message
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Start Legal Review (Run)
        console.log(`Starting Run for Thread: ${thread.id}`);
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Polling Loop (With Safety Checks)
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            
            // DEBUG: Log IDs before every check to catch the "undefined" error
            // console.log(`Checking: Thread ${thread.id} / Run ${run.id}`);

            if (!thread.id || !run.id) {
                throw new Error("Critical: Thread ID or Run ID lost during polling.");
            }

            // Retrieve status
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            // AUTO-CANCEL: If AI tries to use a tool (which we deleted), kill it safely
            if (run.status === 'requires_action') {
                console.log("Cancelling ghost tool call...");
                await openai.beta.threads.runs.cancel(thread.id, run.id);
                // Force a text response instead
                await openai.beta.threads.messages.create(thread.id, { 
                    role: "user", 
                    content: "System: Do not use tools. Search your Knowledge Base files only." 
                });
                run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                console.error("Run Failed Error:", run.last_error);
                throw new Error(`AI Process Failed: ${run.last_error?.message || run.status}`);
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Get Answer
        const messages = await openai.beta.threads.messages.list(thread.id);
        const advice = messages.data[0]?.content[0]?.text?.value || "I reviewed the files but found no result.";

        res.json({ response: advice, threadId: thread.id });

    } catch (err) {
        console.error("Server Crash Report:", err.message);
        res.status(500).json({ 
            response: `**Connection Error:** ${err.message}. Please try again.`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server live on ${PORT}`));
server.timeout = 120000;
