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
// Paste your "AIza..." key inside these quotes.
// ==========================================
const HARDCODED_KEY = "AIzaSyDx5K2kBXNUphvE7aRFeon_JqM5eE32WWk"; 

// Initialize Gemini with the hardcoded key
const genAI = new GoogleGenerativeAI(HARDCODED_KEY);
const fileManager = new GoogleAIFileManager(HARDCODED_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    systemInstruction: `ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. Professional, swagger, metaphors. 
    PROTOCOL: Analyze contracts for Term, Royalties, Masters, 360 clauses. Call out red flags immediately.`
});

// --- Revenue Logic: Usage Tracker ---
const userUsage = {}; 
const FREE_LIMIT = 1; // 1 Free Question before paywall

// --- Auto-Create Uploads Folder ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

// --- Route 1: The Gold Dashboard ---
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve assets
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer
const upload = multer({ dest: 'uploads/' });

// --- Route 2: The Logic Engine ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    
    // Revenue Gatekeeper
    if (!threadId || threadId === "null") {
        threadId = "session_" + Date.now();
        userUsage[threadId] = 0;
    }
    
    // Uncomment this block to enable the "Paywall" after 1 question
    /*
    if (userUsage[threadId] >= FREE_LIMIT) {
         return res.json({ 
             response: "**🔒 UPGRADE REQUIRED**\n\nYour free strategy session has ended. To unlock deep analysis, upgrade to ZaHouse Alpha.",
             threadId: threadId 
         });
    }
    */
    userUsage[threadId]++;

    try {
        const chat = model.startChat({ history: [] }); // Simple chat start
        let result;

        if (req.file) {
            // Handle PDF Upload
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: req.file.mimetype || "application/pdf",
                displayName: req.file.originalname,
            });

            // Wait 1 second for Google to process the file
            await new Promise(r => setTimeout(r, 1000));

            result = await chat.sendMessage([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: message || "Analyze this contract." }
            ]);
            
            // Cleanup
            fs.unlinkSync(newPath);
        } else {
            // Handle Text Only
            result = await chat.sendMessage(message);
        }

        res.json({ response: result.response.text(), threadId: threadId });

    } catch (err) {
        console.error("Gemini Error:", err);
        // Send actual error to chat for debugging
        res.status(500).json({ 
            response: `**SYSTEM ERROR:** ${err.message}. \n\n*Check that your API key inside index.js is correct and enabled.*`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Live on Port ${PORT}`));
