require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Stable OpenAI connection
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post('/audit', async (req, res) => {
    // We keep "threadId" so the AI remembers the conversation context
    const { message, threadId } = req.body;

    try {
        // 1. Initialize or Load Thread
        let thread;
        if (threadId && threadId !== "null" && threadId !== "undefined") {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`New Consultation Started: ${thread.id}`);
        }

        // 2. Add User Question to the Thread
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Run the "Legal Specialist" (No tools, just thinking)
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Wait for the Advice (Simple Polling)
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            
            // If the AI fails (e.g., file error), we catch it here
            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                throw new Error(`Consultation interrupted: ${run.last_error?.message || run.status}`);
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Retrieve the AI's Advice
        const messages = await openai.beta.threads.messages.list(thread.id);
        const advice = messages.data[0]?.content[0]?.text?.value || "I need a moment to review your case files. Please ask again.";

        // Return the clean text + threadId for the next follow-up question
        res.json({ response: advice, threadId: thread.id });

    } catch (err) {
        console.error("Legal Server Error:", err.message);
        res.status(500).json({ response: "Our legal database is currently syncing. Please try again in a moment.", error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server live on ${PORT}`));

// Keep connection open for long legal answers
server.timeout = 120000;
