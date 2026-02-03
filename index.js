require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');
// 1. Load Google Library
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// --- SECRETS ---
// Groq Key (Main Engine)
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Google Key (Test Engine) - PASTE YOUR GOOGLE KEY HERE FOR ONE LAST TEST
const GOOGLE_API_KEY = "AIzaSyDx5K2kBXNUphvE7aRFeon_JqM5eE32WWk"; 
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ dest: 'uploads/' });

// --- MAIN ROUTE: GROQ (STABLE) ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let context = "";
    try {
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            context = `\n\nCONTRACT TEXT:\n${pdfData.text.substring(0, 20000)}`; 
            fs.unlinkSync(req.file.path); 
        }
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'. KNOWLEDGE: USCO requires human authorship for AI copyright. Streaming royalties must be >20%."
                },
                {
                    role: "user",
                    content: (message || "Analyze this.") + context
                }
            ],
            model: "llama-3.3-70b-versatile", 
        });
        res.json({ response: chatCompletion.choices[0]?.message?.content, threadId: threadId });
    } catch (err) {
        res.status(500).json({ response: `Groq Error: ${err.message}` });
    }
});

// --- TEST ROUTE: GOOGLE (DEBUG) ---
// We will trigger this manually to see if it works
app.get('/test-google', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello Google, are you awake?");
        res.send(`<h1>SUCCESS! Google is working.</h1><p>${result.response.text()}</p>`);
    } catch (err) {
        res.send(`<h1>GOOGLE FAILED</h1><p>Error: ${err.message}</p>`);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Hybrid Engine Live on Port ${PORT}`));
