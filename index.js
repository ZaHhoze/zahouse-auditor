require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- SEARCH TOOL (The Eyes) ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        console.log(`🔎 Searching Tavily for: ${query}`);
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 3
            })
        });
        const data = await response.json();
        return `\n\n=== 🌍 LIVE WEB NEWS ===\n${data.answer}\n(Sources: ${data.results.map(r => r.title).join(', ')})`;
    } catch (err) {
        console.error("Search failed:", err);
        return null;
    }
}

// 1. KNOWLEDGE BASE (Permanent Brain)
let PERMANENT_BRAIN = "";
async function loadBrain() {
    const brainDir = path.join(__dirname, 'knowledge_base');
    if (!fs.existsSync(brainDir)) { fs.mkdirSync(brainDir); return; }
    
    const files = fs.readdirSync(brainDir);
    for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(path.join(brainDir, file));
            const data = await pdf(dataBuffer);
            PERMANENT_BRAIN += `\n\n--- SOURCE: ${file} ---\n${data.text.substring(0, 8000)}`;
        }
    }
    console.log("✅ Knowledge Base Loaded!");
}
loadBrain();

// --- UPLOAD HANDLING ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// --- THE LOGIC ENGINE (V3) ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let contractText = "";
    let systemPrompt = "";
    let searchContext = "";

    try {
        // === MODE A: AUDIT (User uploaded a File) ===
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contractText = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 15000)}`; 
            fs.unlinkSync(req.file.path);

            systemPrompt = `
            ROLE: ZaHouse Forensic IP Architect.
            TONE: "Suits meets The Streets".
            YOUR KNOWLEDGE: ${PERMANENT_BRAIN.substring(0, 10000)}
            TASK: Generate a Deal Scorecard (0-100), Verdict, Risk Table, and Red Flags.
            `;
            
        } else {
            // === MODE B: CHAT + SEARCH (User Text Only) ===
            const lowerMsg = message.toLowerCase();
            // Trigger search if asking for news, updates, or specific entities
            if (lowerMsg.includes("news") || lowerMsg.includes("latest") || lowerMsg.includes("suno") || lowerMsg.includes("lawsuit") || lowerMsg.includes("update")) {
                const webResult = await searchWeb(message);
                if (webResult) searchContext = webResult;
            }

            systemPrompt = `
            ROLE: ZaHouse Music Law Strategist.
            TONE: 'Suits meets The Streets'. Professional, swagger, metaphors.
            YOUR KNOWLEDGE: ${PERMANENT_BRAIN.substring(0, 10000)}
            INSTRUCTION: Use the 'LIVE WEB NEWS' below if present to answer accurately. Otherwise use your training.
            `;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Hello") + contractText + searchContext }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500, 
            temperature: 0.6,
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content, 
            threadId: threadId 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(400).json({ response: "**System Error:** " + err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V3 (Live Internet) on Port ${PORT}`));
