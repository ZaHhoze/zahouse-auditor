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

// ==========================================
// 🚨 THE NUCLEAR FIX: HARDCODED KEY 🚨
// ==========================================
const HARDCODED_KEY = "AIzaSyDx5K2kBXNUphvE7aRFeon_JqM5eE32WWk"; 

const genAI = new GoogleGenerativeAI(HARDCODED_KEY);
const fileManager = new GoogleAIFileManager(HARDCODED_KEY);

// FIXED: Using 'gemini-1.5-flash' for maximum Free Tier stability
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
    systemInstruction: "ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. Professional, swagger, metaphors."
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ dest: 'uploads/' });

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    try {
        const chat = model.startChat({ history: [] });
        let result;

        if (req.file) {
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: req.file.mimetype || "application/pdf",
                displayName: req.file.originalname,
            });

            await new Promise(r => setTimeout(r, 2000)); // 2 sec buffer for free tier file processing

            result = await chat.sendMessage([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: message || "Analyze this contract for red flags." }
            ]);
            fs.unlinkSync(newPath);
        } else {
            result = await chat.sendMessage(message || "Hello");
        }

        res.json({ response: result.response.text(), threadId: threadId || "gen_" + Date.now() });

    } catch (err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ 
            response: `**FREE TIER ERROR:** ${err.message}. \n\n*Ensure your API Key is from Google AI Studio and not Google Cloud Vertex AI.*`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Free Tier Engine Live on Port ${PORT}`));
