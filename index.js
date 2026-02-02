require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI Connection
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});
const ASSISTANT_ID = process.env.ASSISTANT_ID;

// Route: Handles the Legal Consultation
app.post('/audit', async (req, res) => {
    // We keep the variable names compatible with your website
    const { message, threadId } = req.body;

    try {
        // 1. Thread Management (Remembers the conversation)
        let thread;
        if (threadId && threadId !== "null" && threadId !== "undefined") {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`New Legal Case Started: ${thread.id}`);
        }

        // 2. Send User Question
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Start the "Thinking" Process (Uses File Search automatically)
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Wait for Answer (Simple Polling)
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);
            
            // If the AI hits a snag, we catch it here
            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                console.error("Run Status:", run.status);
                throw new Error(`Consultation interrupted. Status: ${run.status}`);
            }

            // Check every 1 second
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Retrieve the Advice
        const messages = await openai.beta.threads.messages.list(thread.id);
        
        // Get the latest response from the AI
        const advice = messages.data[0]?.content[0]?.text?.value || "I'm reviewing the case files. Please ask again.";

        // Send back to website
        res.json({ response: advice, threadId: thread.id });

    } catch (err) {
        console.error("Legal Server Error:", err.message);
        res.status(500).json({ 
            response: "Re-indexing legal library... please try again in 10 seconds.", 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server live on ${PORT}`));

// Keep the connection open for long answers
server.timeout = 120000;
