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
// Serve the Full Screen App
app.use(express.static('public'));

// Configure Multer for Uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro", // The Heavy Hitter (Closest to 'Gemini 3')
    systemInstruction: `
    ROLE: You are the ZaHouse Music Law Strategist. You are a high-level industry insider, deal-maker, and protector of creative equity.
    
    TONE:
    - "Suits meets The Streets." Professional but with swagger.
    - Use metaphors (e.g., "Don't let them own the dirt your house sits on.").
    - Be direct about bad deals. Call out "Red Flags" instantly.

    PROTOCOL:
    - If a user uploads a contract, analyze it for: Term Duration, Royalty Splits, Master Ownership, and hidden "360" clauses.
    - If the deal is bad, tell them.
    - Always end with: "ZaHouse is here to engineer your equity. If you need a shark in the room, click the button to negotiate."
    `
});

// Simple In-Memory Storage for Chat History
// (Since Gemini API is stateless, we store the history here mapped to threadId)
const chatSessions = {};

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;

    try {
        // 1. Setup Thread ID
        if (!threadId || threadId === "null") {
            threadId = "session_" + Date.now();
            chatSessions[threadId] = model.startChat({
                history: [
                    {
                        role: "user",
                        parts: [{ text: "Hello, I need legal strategy." }],
                    },
                    {
                        role: "model",
                        parts: [{ text: "Yo, I'm the ZaHouse Strategist. Drop the contract or tell me the splits. Let's see if you're owning the dirt or just renting the bricks." }],
                    },
                ],
            });
            console.log(`New Gemini Session: ${threadId}`);
        }

        const chat = chatSessions[threadId];
        let result;

        // 2. Handle File Upload (Contract Analysis)
        if (req.file) {
            console.log(`Processing Contract: ${req.file.originalname}`);
            
            // Rename for extension safety
            const mimeType = req.file.mimetype || "application/pdf";
            const originalExt = path.extname(req.file.originalname) || ".pdf";
            const newPath = req.file.path + originalExt;
            fs.renameSync(req.file.path, newPath);

            // Upload to Google
            const uploadResponse = await fileManager.uploadFile(newPath, {
                mimeType: mimeType,
                displayName: req.file.originalname,
            });
            
            console.log(`Uploaded to Gemini: ${uploadResponse.file.name}`);

            // Wait for file to be active (usually instant, but safety first)
            await new Promise(r => setTimeout(r, 1000));

            // Send File + Message
            result = await chat.sendMessage([
                {
                    fileData: {
                        mimeType: uploadResponse.file.mimeType,
                        fileUri: uploadResponse.file.uri
                    }
                },
                { text: message || "Analyze this contract for red flags immediately." }
            ]);

            // Cleanup local file
            fs.unlinkSync(newPath);

        } else {
            // 3. Handle Text Only
            result = await chat.sendMessage(message);
        }

        const responseText = result.response.text();
        res.json({ response: responseText, threadId: threadId });

    } catch (err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ 
            response: "My legal team is reviewing the files. Try again in a second.", 
            error: err.message 
        });
    }
});

// Serve the Frontend on Root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Strategist (Gemini Powered) live on ${PORT}`));
