require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');

// --- NEW: SEARCH TOOL ---
// We use standard 'fetch' to avoid installing new packages
const searchWeb = async (query) => {
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query: query,
                search_depth: "basic",
                include_answer: true, // Asks Tavily to write a summary
                max_results: 3
            })
        });
        const data = await response.json();
        return `\n\n=== 🌍 LIVE WEB SEARCH RESULTS ===\n${data.answer || "No direct summary."}\nSources: ${data.results.map(r => r.content).join("\n")}`;
    } catch (err) {
        console.error("Search Error:", err);
        return "\n\n(Note: Internet search failed. Answering from memory.)";
    }
};

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const groq = new Groq({ apiKey: GROQ_API_KEY });

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
            PERMANENT_BRAIN += `\n\n--- SOURCE: ${file} ---\n${data.text.substring(0, 10000)}`;
        }
    }
    console.log("✅ Knowledge Base Loaded!");
}
loadBrain();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let contextData = "";
    let systemPrompt = "";

    try {
        if (req.file) {
            // --- MODE A: AUDIT (Scorecard) ---
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 12000)}`; 
            fs.unlinkSync(req.file.path);

            systemPrompt = `ROLE: ZaHouse Forensic IP Architect. TONE: "Suits meets The Streets". KNOWLEDGE: ${PERMANENT_BRAIN.substring(0,10000)} OUTPUT: Deal Scorecard (0-100), Verdict, Risk Table, Red Flags.`;
            
        } else {
            // --- MODE B: CHAT + WEB SEARCH ---
            // 1. Check if user wants "Real World" info
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("news") || lowerMsg.includes("latest") || lowerMsg.includes("search") || lowerMsg.includes("update") || lowerMsg.includes("suno") || lowerMsg.includes("who is")) {
                console.log("🔎 Searching the web for:", message);
                const searchResults = await searchWeb(message);
                contextData += searchResults; // Inject live data
            }

            systemPrompt = `
            ROLE: ZaHouse Music Law Strategist. TONE: 'Suits meets The Streets'.
            YOUR BRAIN: ${PERMANENT_BRAIN.substring(0, 10000)}
            
            INSTRUCTION: If 'LIVE WEB SEARCH RESULTS' are provided below, use them to answer the user's question with up-to-date facts. If not, use your legal knowledge.
            `;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Hello") + contextData }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500, 
            temperature: 0.6,
        });

        res.json({ response: chatCompletion.choices[0]?.message?.content, threadId: threadId });

    } catch (err) {
        res.status(400).json({ response: "**SYSTEM ERROR:** " + err.message, error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V3 (Live Internet) on Port ${PORT}`));
