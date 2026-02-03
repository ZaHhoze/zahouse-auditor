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
const groq = new Groq({ apiKey: GROQ_API_KEY });

// 1. KNOWLEDGE BASE (The Brain)
// We read all PDFs in the 'knowledge_base' folder on startup
let PERMANENT_BRAIN = "";

async function loadBrain() {
    const brainDir = path.join(__dirname, 'knowledge_base');
    if (!fs.existsSync(brainDir)) {
        fs.mkdirSync(brainDir);
        console.log("Created 'knowledge_base' folder. Put your Master Protocol PDFs here!");
        return;
    }

    const files = fs.readdirSync(brainDir);
    for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
            console.log(`🧠 Memorizing: ${file}...`);
            const dataBuffer = fs.readFileSync(path.join(brainDir, file));
            const data = await pdf(dataBuffer);
            PERMANENT_BRAIN += `\n\n--- SOURCE: ${file} ---\n${data.text.substring(0, 30000)}`;
        }
    }
    console.log("✅ Knowledge Base Loaded!");
}
loadBrain(); // Run on startup

// --- UPLOAD HANDLING ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: 'uploads/' });

// --- DASHBOARD ---
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));


// --- THE V2 LOGIC ENGINE ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let contractText = "";

    try {
        // 1. Read the CONTRACT (User Upload)
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contractText = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 50000)}`; 
            fs.unlinkSync(req.file.path); 
        }

        // 2. The "Scorecard" Prompt
        const systemPrompt = `
        ROLE: ZaHouse Music Law Strategist.
        TONE: Brutally honest, high-leverage, "Suits meets The Streets".
        
        YOUR BRAIN (KNOWLEDGE BASE):
        ${PERMANENT_BRAIN}
        
        INSTRUCTIONS:
        1. Compare the "CONTRACT TO AUDIT" against the "KNOWLEDGE BASE" (Your rules).
        2. GENERATE A SCORECARD.
        
        REQUIRED OUTPUT FORMAT (Do not deviate):
        
        # 🚨 DEAL SCORE: [0-100]/100
        
        ## ⚖️ THE VERDICT
        (2-3 sentences summary. Is this a bag or a trap?)
        
        ## 📊 RISK ANALYSIS CHART
        | Category | Rating | Status |
        | :--- | :--- | :--- |
        | **Masters Ownership** | [0-10]/10 | [Safe/Trap] |
        | **Royalty Rate** | [0-10]/10 | [Good/Bad] |
        | **360 Clauses** | [0-10]/10 | [Clean/Toxic] |
        | **Term Length** | [0-10]/10 | [Fair/Slave] |
        
        ## 🚩 RED FLAGS (The "Gotchas")
        * **[Clause Name]**: [Why it sucks]. *Strategy: Change X to Y.*
        * **[Clause Name]**: [Why it sucks]. *Strategy: Change X to Y.*
        
        ## 💎 THE ZAHOUSE STRATEGY
        (How we counter-offer to win).
        `;

        // 3. Send to Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Rate this deal.") + contractText }
            ],
            model: "llama-3.3-70b-versatile", 
            temperature: 0.5, // Lower temp for more accurate math/tables
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content, 
            threadId: threadId 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(500).json({ response: `**ENGINE ERROR:** ${err.message}` });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V2 (Scorecard Edition) Live on Port ${PORT}`));
