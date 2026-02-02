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

// THE FIX: Force the browser to render HTML instead of raw text
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    systemInstruction: "ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. Professional, swagger, metaphors."
});

const chatSessions = {};

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    try {
        if (!threadId || threadId === "null") {
            threadId = "session_" + Date.now();
            chatSessions[threadId] = model.startChat({ history: [] });
        }
        const chat = chatSessions[threadId];
        let result;
        if (req.file) {
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);
            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: req.file.mimetype || "application/pdf",
                displayName: req.file.originalname,
            });
            result = await chat.sendMessage([{ fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } }, { text: message || "Analyze this." }]);
            fs.unlinkSync(newPath);
        } else {
            result = await chat.sendMessage(message);
        }
        res.json({ response: result.response.text(), threadId: threadId });
    } catch (err) {
        res.status(500).json({ response: "My legal team is reviewing. Try again.", error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse App Live on ${PORT}`));
