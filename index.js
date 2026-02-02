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
        // 1. Thread Safety (Prevents "Invalid Path" crash)
        let thread;
        if (threadId && threadId.startsWith('thread_')) {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
            console.log(`New Legal Consultation: ${thread.id}`);
        }

        // 2. Send the User's Question
        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // 3. Run the Assistant (Uses File Search automatically)
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // 4. Smart Polling Loop
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            // CRITICAL FIX: If AI tries to use a tool (Web Search), we cancel it to prevent hanging.
            if (run.status === 'requires_action') {
                console.log("Cancelling unexpected tool call...");
                await openai.beta.threads.runs.cancel(thread.id, run.id);
                throw new Error("I tried to search the web, but I am restricted to your private Case Files only.");
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                throw new Error(`AI Status: ${run.status}`);
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        // 5. Get the Answer
        const messages = await openai.beta.threads.messages.list(thread.id);
        const advice = messages.data[0]?.content[0]?.text?.value || "I reviewed the files but found no matching records.";

        res.json({ response: advice, threadId: thread.id });

    } catch (err) {
        console.error("Legal Server Error:", err.message);
        // This specific error message will show up clearly on your website
        res.status(500).json({ 
            response: `**System Notice:** ${err.message}`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server live on ${PORT}`));
server.timeout = 120000;
