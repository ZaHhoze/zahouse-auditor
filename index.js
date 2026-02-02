require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk"); // The New Brain
const pdf = require('pdf-parse'); // The PDF Reader

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🚨 PASTE YOUR GROQ KEY HERE 🚨
// ==========================================
// SAFE MODE: Use the Variable from Railway
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

// Force HTML Dashboard
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ dest: 'uploads/' });

// --- THE NEW LOGIC ENGINE ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let context = "";

    try {
        // 1. If a file is uploaded, we read the text manually
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            context = `\n\nCONTRACT TEXT:\n${pdfData.text.substring(0, 20000)}`; // Limit to ~20k chars for speed
            fs.unlinkSync(req.file.path); // Clean up
        }

        // 2. Send to Groq (Llama 3)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. Professional, swagger, metaphors. GOAL: Protect the artist. Call out 360 deals, bad royalties, and ownership traps."
                },
                {
                    role: "user",
                    content: (message || "Analyze this contract.") + context
                }
            ],
            model: "llama3-70b-8192", // The Powerhouse Model
            temperature: 0.6,
        });

        // 3. Send Response
        res.json({ 
            response: chatCompletion.choices[0]?.message?.content || "No analysis generated.", 
            threadId: threadId || "groq_" + Date.now() 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(500).json({ 
            response: `**ENGINE ERROR:** ${err.message}.`, 
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Groq Engine Live on Port ${PORT}`));
