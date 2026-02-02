require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});

const ASSISTANT_ID = process.env.ASSISTANT_ID; 

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let fileId = null;

    try {
        // 1. FILE UPLOAD HANDLING
        if (req.file) {
            console.log(`Processing file: ${req.file.originalname}`);
            const originalExt = path.extname(req.file.originalname) || ".pdf"; // Default to .pdf if missing
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            const openaiFile = await openai.files.create({
                file: fs.createReadStream(newPath),
                purpose: "assistants",
            });
            fileId = openaiFile.id;
            fs.unlinkSync(newPath); // Clean up
        }

        // 2. THREAD MANAGEMENT
        let myThreadId = threadId;
        if (!myThreadId || !myThreadId.startsWith('thread_')) {
            const thread = await openai.beta.threads.create();
            myThreadId = thread.id;
        }

        // 3. PREPARE MESSAGE
        const messagePayload = {
            role: "user",
            content: message || "Please analyze this attached document."
        };

        if (fileId) {
            messagePayload.attachments = [{
                file_id: fileId,
                tools: [{ type: "file_search" }] // Enable the AI to read the file
            }];
        }

        await openai.beta.threads.messages.create(myThreadId, messagePayload);

        // 4. RUN AND POLL (With Error Exposure)
        const run = await openai.beta.threads.runs.createAndPoll(myThreadId, { 
            assistant_id: ASSISTANT_ID 
        });

        // 5. RESULT HANDLING
        if (run.status === 'completed') {
            const messages = await openai.beta.threads.messages.list(run.thread_id);
            const responseText = messages.data[0].content[0].text.value;
            res.json({ response: responseText, threadId: myThreadId });
        } else {
            // DEBUG FIX: Reveal exactly why it failed
            const reason = run.last_error ? run.last_error.message : `Run Status: ${run.status}`;
            console.log(`Analysis Incomplete: ${reason}`);
            
            res.json({ 
                response: `**Analysis Paused:** ${reason}. \n\nTry asking: "What does the file say?" to retry reading it.`, 
                threadId: myThreadId 
            });
        }

    } catch (err) {
        console.error("SERVER CRASH:", err.message);
        res.status(500).json({ response: `System Error: ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`Legal Server Live on ${PORT}`));
server.timeout = 120000;
