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

// CRITICAL: This must be your 'asst_' ID from the Assistants tab, NOT the 'pmpt_' ID.
const ASSISTANT_ID = process.env.ASSISTANT_ID; 

app.post('/audit', async (req, res) => {
    let { message, threadId } = req.body;

    try {
        // --- STEP 1: FORCE THREAD LOCK ---
        // We create a new variable 'activeThreadId' that CANNOT be undefined.
        // This fixes the "Value of type Undefined" error you see in the logs.
        let activeThreadId;

        if (threadId && threadId.startsWith('thread_')) {
            activeThreadId = threadId;
            console.log(`>>> RESUMING THREAD: ${activeThreadId}`);
        } else {
            const newThread = await openai.beta.threads.create();
            activeThreadId = newThread.id;
            console.log(`>>> CREATED NEW THREAD: ${activeThreadId}`);
        }

        // --- STEP 2: SEND MESSAGE ---
        await openai.beta.threads.messages.create(activeThreadId, { 
            role: "user", 
            content: message 
        });

        // --- STEP 3: START RUN ---
        let run = await openai.beta.threads.runs.create(activeThreadId, { 
            assistant_id: ASSISTANT_ID 
        });
        
        // --- STEP 4: POLLING LOOP ---
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 60) {
            
            // SLEEP
            await new Promise(r => setTimeout(r, 1000));

            // THE FIX: We use 'activeThreadId' which we locked in Step 1.
            run = await openai.beta.threads.runs.retrieve(activeThreadId, run.id);

            // LOGGING: Check your Railway logs for this specific line if it fails
            console.log(`Checking Run: ${run.id} on Thread: ${activeThreadId} -> Status: ${run.status}`);

            if (run.status === 'requires_action') {
                // If it tries to search the web (which is broken), we force it to stop
                await openai.beta.threads.runs.cancel(activeThreadId, run.id);
                throw new Error("I can only check your uploaded Knowledge Base files.");
            }

            if (['failed', 'cancelled', 'expired'].includes(run.status)) {
                throw new Error(`Run failed with status: ${run.status}`);
            }
            attempts++;
        }

        // --- STEP 5: GET RESPONSE ---
        const messages = await openai.beta.threads.messages.list(activeThreadId);
        const advice = messages.data[0]?.content[0]?.text?.value || "I reviewed the files but found no response.";

        res.json({ response: advice, threadId: activeThreadId });

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ 
            response: `**System Error:** ${err.message}`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`Legal Server Active on ${PORT}`));
server.timeout = 120000;
