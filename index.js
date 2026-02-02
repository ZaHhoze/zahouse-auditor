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
        // 1. Thread Logic (With explicit error checking)
        let thread;
        if (threadId && threadId.startsWith('thread_')) {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            if (!thread || !thread.id) throw new Error("Failed to create a valid thread.");
            console.log(`New Consultation: ${thread.id}`);
        }

        // 2. Send User Message
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Run the Assistant (It will decide to use File Search automatically)
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Polling Loop (Simple & Stable)
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            
            // Wait 1 second
            await new Promise(r => setTimeout(r, 1000));
            
            // Check status
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            // AUTO-FIX: If the AI tries to run the old tool, we cancel it to prevent a crash
            if (run.status === 'requires_action') {
                console.log("Cancelling ghost tool call...");
                await openai.beta.threads.runs.cancel(thread.id, run.id);
                // We ask it to continue with just the text answer
                await openai.beta.threads.messages.create(thread.id, { 
                    role: "user", 
                    content: "Please ignore the search tool. Answer using only your Knowledge Base files." 
                });
                run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                console.error("Run failed:", run.last_error);
                throw new Error(`AI Status: ${run.status}`);
            }
            attempts++;
        }

        // 5. Get the Answer
        const messages = await openai.beta.threads.messages.list(thread.id);
        const advice = messages.data[0]?.content[0]?.text?.value || "I am reviewing your files. Please ask again.";

        res.json({ response: advice, threadId: thread.id });

    } catch (err) {
        console.error("Server Error:", err.message);
        res.status(500).json({ response: `**System Notice:** ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server live on ${PORT}`));
server.timeout = 120000;
