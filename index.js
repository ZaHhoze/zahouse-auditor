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
            // TRUNCATE: Only take core rules to save memory
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

// --- THE LOGIC ENGINE (DUAL MODE) ---
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, threadId } = req.body;
    let contractText = "";
    let systemPrompt = "";

    try {
        // === MODE SELECTION ===
        
        if (req.file) {
            // 🚨 MODE A: AUDIT (User uploaded a PDF)
            // We force the Scorecard Format
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contractText = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 12000)}`; 
            fs.unlinkSync(req.file.path);

            systemPrompt = `
            ROLE: ZaHouse Forensic IP Architect.
            TONE: "Suits meets The Streets". High-leverage, architectural metaphors.
            
            YOUR KNOWLEDGE BASE:
            ${PERMANENT_BRAIN.substring(0, 15000)}
            
            TASK: Audit the attached contract.
            
            OUTPUT FORMAT (MANDATORY FOR AUDITS):
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
            * List the traps found.
            `;
            
        } else {
            // 🗣️ MODE B: CHAT (User just asked a question)
            // We use a Conversational Format (No Scorecard)
            
            systemPrompt = `
            ROLE: ZaHouse Music Law Strategist.
            TONE: 'Suits meets The Streets'. Professional, swagger, metaphors.
            GOAL: Answer the artist's question using your legal knowledge. Do NOT generate a scorecard unless asked.

            YOUR KNOWLEDGE BASE (LEGAL BIBLE):
            ${PERMANENT_BRAIN.substring(0, 15000)}

            KEY PROTOCOLS:
            1. AI COPYRIGHT: USCO requires human authorship. You can copyright lyrics/composition, but not the AI audio. Disclose usage honestly.
            2. STREAMING: Demand 20%+.
            3. MASTERS: If they own it, you're an employee.
            4. 360 DEALS: "You don't eat off plates you didn't cook on."
            `;
        }

        // 3. Send to Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Hello") + contractText }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500, 
            temperature: 0.6,
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content, 
            threadId: threadId || "groq_" + Date.now() 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(400).json({ 
            response: "**SYSTEM ERROR:** I tripped over a wire. Try shorter text or a different file.",
            error: err.message 
        });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Dual-Mode Engine Live on Port ${PORT}`));
