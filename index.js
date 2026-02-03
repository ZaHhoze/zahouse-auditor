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
// Automatically looks for GROQ_API_KEY or your ZAHOUSE_STRATEGIST variable
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// 1. KNOWLEDGE BASE (The Permanent Brain)
let PERMANENT_BRAIN = "";

async function loadBrain() {
    const brainDir = path.join(__dirname, 'knowledge_base');
    if (!fs.existsSync(brainDir)) {
        fs.mkdirSync(brainDir);
        return;
    }

    const files = fs.readdirSync(brainDir);
    for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
            console.log(`🧠 Memorizing: ${file}...`);
            const dataBuffer = fs.readFileSync(path.join(brainDir, file));
            const data = await pdf(dataBuffer);
            // TRUNCATE BRAIN: Only take the core rules to save room for the audit
            PERMANENT_BRAIN += `\n\n--- SOURCE: ${file} ---\n${data.text.substring(0, 10000)}`;
        }
    }
    console.log("✅ Knowledge Base Synchronized!");
}
loadBrain();

// --- UPLOAD HANDLING ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: 'uploads/' });

// Serve Dashboard
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// --- THE LOGIC ENGINE ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let contractText = "";

    try {
        // 1. Read and SHRED the CONTRACT
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            // TRUNCATE: Only take the first 12,000 chars to avoid 400 Errors
            contractText = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 12000)}`; 
            fs.unlinkSync(req.file.path); 
        }

        // 2. The Forensic Alpha Prompt
        const systemPrompt = `
        ROLE: ZaHouse Forensic IP Architect. You decode "Engineered Equity".
        TONE: "Suits meets The Streets". High-leverage, architectural metaphors.
        
        YOUR PERMANENT KNOWLEDGE:
        ${PERMANENT_BRAIN.substring(0, 15000)}
        
        OUTPUT FORMAT (MANDATORY):
        # 🚨 DEAL SCORE: [0-100]/100
        ## ⚖️ THE VERDICT
        (Summary of equity vs employment status)
        ## 📊 RISK ANALYSIS CHART
        | Category | Rating | Status |
        | :--- | :--- | :--- |
        | **Masters Ownership** | [0-10]/10 | [Safe/Trap] |
        | **Royalty Rate** | [0-10]/10 | [Good/Bad] |
        | **360 Clauses** | [0-10]/10 | [Clean/Toxic] |
        | **Term Length** | [0-10]/10 | [Fair/Slave] |
        ## 🚩 RED FLAGS
        * List the traps found in the text.
        `;

        // 3. Request Completion
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Analyze this deal.") + contractText }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500, // Safety cap to stay under minute limits
            temperature: 0.5,
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content, 
            threadId: threadId || "groq_" + Date.now() 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(400).json({ 
            response: "📏 **LIMIT REACHED:** This contract is too massive for the Free Tier. I've analyzed the first 20 pages—check the results or try a shorter excerpt.",
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V2.1 Stabilized on Port ${PORT}`));
