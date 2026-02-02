require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path'); // Added this to handle extensions
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Configure Multer (Temp storage)
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
        // --- STEP 1: HANDLE FILE UPLOAD ---
        if (req.file) {
            console.log(`Received upload: ${req.file.originalname}`);
            
            // THE FIX: Multer saves files without extensions. We must add it back.
            // 1. Get the extension (e.g., ".pdf")
            const originalExt = path.extname(req.file.originalname);
            // 2. Create a new path with the extension
            const newPath = req.file.path + originalExt;
            // 3. Rename the file on disk
            fs.renameSync(req.file.path, newPath);

            // 4. Send the RENAMED file to OpenAI
            const openaiFile = await openai.files.create({
                file: fs.createReadStream(newPath),
                purpose: "assistants",
            });
            fileId = openaiFile.id;
            
            // 5. Clean up the temp file
            fs.unlinkSync(newPath);
            console.log(`File attached to OpenAI: ${fileId}`);
        }

        // --- STEP 2: MANAGE THREAD ---
        let myThreadId = threadId;
        if (!myThreadId || !myThreadId.startsWith('thread_')) {
            const thread = await openai.beta.threads.create();
            myThreadId = thread.id;
        }

        // --- STEP 3: SEND MESSAGE ---
        const messagePayload = {
            role: "user",
            content: message || "Please review this document."
        };

        // Attach the file ID if we have one
        if (fileId) {
            messagePayload.attachments = [{
                file_id: fileId,
                tools: [{ type: "file_search" }] // Allows the AI to read the PDF
            }];
        }

        await openai.beta.threads.messages.create(myThreadId, messagePayload);

        // --- STEP 4: CREATE AND POLL ---
        const run = await openai.beta.threads.runs.createAndPoll(myThreadId, { 
            assistant_id: ASSISTANT_ID 
        });

        // --- STEP 5: RETURN RESULT ---
        if (run.status === 'completed') {
            const messages = await openai.beta.threads.messages.list(run.thread_id);
            const responseText = messages.data[0].content[0].text.value;
            res.json({ response: responseText, threadId: myThreadId });
        } else {
            console.log(`Run Status: ${run.status}`);
            res.json({ 
                response: "I received the file, but I need a moment to process it. Please ask me about it again.", 
                threadId: myThreadId 
            });
        }

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ response: `System Error: ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Legal Server Live on ${PORT}`));
server.timeout = 120000;
