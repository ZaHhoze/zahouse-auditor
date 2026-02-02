require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
app.use(cors());
app.use(express.json());

// 1. Serve Static Files (CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'public')));

// 2. FORCE HTML HEADER for the Homepage
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html'); // <--- THE FIX
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure Multer
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    systemInstruction: `ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. Professional, swagger, metaphors. PROTOCOL: Analyze uploaded contracts for Term, Royalties, Masters, 360 clauses. Call out red flags.`
});

const chatSessions = {};

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;

    try {
        if (!threadId || threadId === "null") {
            threadId = "session_" + Date.now();
            chatSessions[threadId] = model.startChat({
                history: [
                    { role: "user", parts: [{ text: "Hello" }] },
                    { role: "model", parts: [{ text: "Yo, I'm the ZaHouse Strategist. Drop the contract. Let's see if you own the dirt or just the bricks." }] },
                ],
            });
        }

        const chat = chatSessions[threadId];
        let result;

        if (req.file) {
            const mimeType = req.file.mimetype || "application/pdf";
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: mimeType,
                displayName: req.file.originalname,
            });
            await new Promise(r => setTimeout(r, 1000));

            result = await chat.sendMessage([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: message || "Analyze this immediately." }
            ]);
            fs.unlinkSync(newPath);
        } else {
            result = await chat.sendMessage(message);
        }

        res.json({ response: result.response.text(), threadId: threadId });

    } catch (err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ response: "Connection error. Please try again.", error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse App Live on ${PORT}`));
