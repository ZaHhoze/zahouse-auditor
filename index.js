require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // New tool for file uploads
const fs = require('fs');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// Configure Multer (Temp storage for uploads)
const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 
});

const ASSISTANT_ID = process.env.ASSISTANT_ID; 

// Updated Route: Now accepts 'upload.single("file")'
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let fileId = null;

    try {
        // 1. Handle File Upload (If user attached one)
        if (req.file) {
            console.log(`Uploading file: ${req.file.originalname}`);
            const openaiFile = await openai.files.create({
                file: fs.createReadStream(req.file.path),
                purpose: "assistants",
            });
            fileId = openaiFile.id;
            
            // Clean up temp file
            fs.unlinkSync(req.file.path);
        }

        // 2. Get or Create Thread
        let myThreadId = threadId;
        if (!myThreadId || !myThreadId.startsWith('thread_')) {
            const thread = await openai.beta.threads.create();
            myThreadId = thread.id;
        }

        // 3. Prepare Message (With Attachment if exists)
        const messagePayload = {
            role: "user",
            content: message || "Please analyze this document."
        };

        // Attach file to message if we have one
        if (fileId) {
            messagePayload.attachments = [{
                file_id: fileId,
                tools: [{ type: "file_search" }] // Allows AI to read it
            }];
        }

        await openai.beta.threads.messages.create(myThreadId, messagePayload);

        // 4. Create and Poll (The Stable Method)
        const run = await openai.beta.threads.runs.createAndPoll(myThreadId, { 
            assistant_id: ASSISTANT_ID 
        });

        // 5. Response Handling
        if (run.status === 'completed') {
            const messages = await openai.beta.threads.messages.list(run.thread_id);
            const responseText = messages.data[0].content[0].text.value;
            res.json({ response: responseText, threadId: myThreadId });
        } else {
            res.json({ 
                response: "I reviewed the materials but need clarification. Please ask again.", 
                threadId: myThreadId 
            });
        }

    } catch (err) {
        console.error("Server Error:", err.message);
        res.status(500).json({ response: `System Error: ${err.message}`, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`ZaHouse Server (With Uploads) Live on ${PORT}`));
server.timeout = 120000;
