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

// --- CORE CONFIG ---
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- THE STRATEGIST PROTOCOL (Injected from Google AI Studio) ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker. You are here to decode the complex music industry for artists and labels.

GOAL: Provide high-value legal and strategic guidance. If a user provides a contract (via text or PDF), you MUST generate a "Deal Scorecard".

DEAL SCORECARD PROTOCOL:
Evaluate the deal on these 5 metrics (0-10 scale):
1. Ownership Equity: Does the artist own their masters?
2. Recoupment: Are terms predatory (e.g., 100% recoupment)?
3. Creative Control: Does the artist keep the final say?
4. Duration/Term: Is the contract too long?
5. Financial Transparency: Right to audit, clear accounting.

TONE & STYLE:
- Professional swagger. Use metaphors like "bricks vs. dirt".
- Value First: Answer the legal question immediately.
- The "Soft Sell": Pivot to relationship building and offer ZaHouse professional negotiation for complex cases.
- CATCHPHRASE: Ensure they "own the dirt, not just the bricks."

DISCLAIMER: Always end with: "Strategic guidance only. Not binding legal advice."
`;

// --- SEARCH TOOL (The Eyes) ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
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
        return `\n\n=== 🌍 LIVE STREET INTEL ===\n${data.answer}`;
    } catch (err) {
        return null;
    }
}

// --- KNOWLEDGE BASE ---
let PERMANENT_BRAIN = "";
async function loadBrain() {
    const brainDir = path.join(__dirname, 'knowledge_base');
    if (!fs.existsSync(brainDir)) { fs.mkdirSync(brainDir); return; }
    const files = fs.readdirSync(brainDir);
    for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(path.join(brainDir, file));
            const data = await pdf(dataBuffer);
            PERMANENT_BRAIN += `\n\nSOURCE: ${file}\n${data.text.substring(0, 8000)}`;
        }
    }
    console.log("✅ Strategist Brain Loaded");
}
loadBrain();

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- THE MASTER ENGINE ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message } = req.body;
    let contextData = "";

    try {
        if (req.file) {
            // AUDIT MODE
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 15000)}`;
            fs.unlinkSync(req.file.path);
        } else {
            // CHAT MODE + LIVE SEARCH
            const lowerMsg = (message || "").toLowerCase();
            if (lowerMsg.includes("news") || lowerMsg.includes("latest") || lowerMsg.includes("suno") || lowerMsg.includes("update")) {
                const webResult = await searchWeb(message);
                if (webResult) contextData = webResult;
            }
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: ZAHOUSE_SYSTEM_INSTRUCTIONS + "\n\nKNOWLEDGE BASE DATA:\n" + PERMANENT_BRAIN.substring(0, 8000) },
                { role: "user", content: (message || "Hello") + contextData }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500,
            temperature: 0.7, // Balances accuracy with persona swagger
        });

        res.json({ response: chatCompletion.choices[0]?.message?.content });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(400).json({ response: "**System Error:** " + err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V5.3 (Strategist Protocol) on Port ${PORT}`));
