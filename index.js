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
    let { message, threadId } = req.body;

    try {
        // 1. GET OR CREATE THREAD
        // We establish the ID once.
        let myThreadId = threadId;
        if (!myThreadId || !myThreadId.startsWith('thread_')) {
            console.log("Creating new thread...");
            const thread = await openai.beta.threads.create();
            myThreadId = thread.id;
        }
        console.log(`Using Thread ID: ${myThreadId}`);

        // 2. ADD USER MESSAGE
        await openai.beta.threads.messages.create(myThreadId, { 
            role: "user", 
            content: message 
        });

        // 3. THE "DIFFERENT" APPROACH (Auto-Poll)
        // Instead of a manual loop, we let OpenAI handle the waiting.
        // This prevents the "Undefined Path" error because OpenAI manages the IDs internally.
        console.log("Starting Auto-Poll...");
        const run = await openai.beta.threads.runs.createAndPoll(myThreadId, { 
            assistant_id: ASSISTANT_ID 
        });

        // 4. CHECK RESULT
        if (run.status === 'completed') {
            const messages = await openai.beta.threads.messages.list(run.thread_id);
            const responseText = messages.data[0].content[0].text.value;
            
            res.json({ response: responseText, threadId: myThreadId });
        } else {
            // If it failed (e.g., restricted by tool policies), we tell the user.
            console.log(`Run status: ${run.status}`);
            res.json({ 
                response: "I reviewed the files but couldn't generate a complete answer. Please try rephrasing.", 
                threadId: myThreadId 
            });
        }

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ 
            response: `System Error: ${err.message}`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`Legal Server Live on ${PORT}`));
server.timeout = 120000;
