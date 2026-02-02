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

// --- DEBUG: SYSTEM CHECK ON STARTUP ---
console.log("--- SYSTEM STARTUP CHECK ---");
console.log("1. Current Directory:", __dirname);
if (process.env.GEMINI_API_KEY) {
    console.log("2. API Key Status: FOUND (Starts with " + process.env.GEMINI_API_KEY.substring(0, 4) + "...)");
} else {
    console.error("2. API Key Status: MISSING (Check Railway Variables!)");
}
// Check Uploads Folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    console.log("3. Uploads Folder: MISSING (Creating now...)");
    fs.mkdirSync(uploadDir);
} else {
    console.log("3. Uploads Folder: EXISTS");
}

// FORCE HOMEPAGE TO BE HTML
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

const chatSessions = {};

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    console.log(`\n--- NEW REQUEST: ${message || "File Upload"} ---`);

    try {
        if (!threadId || threadId === "null") {
            threadId = "session_" + Date.now();
            chatSessions[threadId] = model.startChat({ history: [] });
        }

        const chat = chatSessions[threadId];
        let result;

        if (req.file) {
            console.log("Processing File:", req.file.originalname);
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: req.file.mimetype || "application/pdf",
                displayName: req.file.originalname,
            });
            
            console.log("File Uploaded to Gemini:", uploadResponse.file.uri);
            
            result = await chat.sendMessage([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: message || "Analyze this." }
            ]);
            fs.unlinkSync(newPath);
        } else {
            console.log("Sending Text to Gemini...");
            result = await chat.sendMessage(message);
        }

        console.log("Gemini Responded Successfully.");
        res.json({ response: result.response.text(), threadId: threadId });

    } catch (err) {
        console.error("CRITICAL ERROR:", err);
        // --- DEBUG RESPONSE: Send the REAL error to the user ---
        res.status(500).json({ 
            response: `**SYSTEM ERROR:**\n${err.message}\n\n*Show this to your developer.*`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Debugger Live on ${PORT}`));
