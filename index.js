require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');
const { jsPDF } = require("jspdf");
require("jspdf-autotable");

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- FIXED SYSTEM INSTRUCTIONS (No more syntax errors) ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist—an industry insider and protector of creative equity. 

THE "SOFT SELL" PROTOCOL:
1. Value First: Answer the legal question immediately.
2. The Hook: Pivot to relationship building. Ask for their artist name or IG.
3. The Close: Offer ZaHouse professional negotiation.

TONE: Conversational, authentic, and metaphorical. Use "bricks vs. dirt" concepts.

VISUAL SCORECARD PROTOCOL:
If a contract is provided, you MUST output this EXACT Markdown Table:

### 🚨 FORENSIC DEAL SCORE: [Score]/100

| ⚖️ METRIC | 📊 RATING (0-10) | 🔎 ARCHITECT'S NOTES |
| :--- | :---: | :--- |
| **Ownership** | [X]/10 | [Note] |
| **Recoupment** | [X]/10 | [Note] |
| **Control** | [X]/10 | [Note] |
| **Term** | [X]/10 | [Note] |
| **Transparency** | [X]/10 | [Note] |

**THE VERDICT:** [Real Talk summary]
`;

// --- SEARCH & PDF TOOLS ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", include_answer: true, max_results: 3 })
        });
        const data = await response.json();
        return `\n\n=== 🌍 STREET INTEL ===\n${data.answer}`;
    } catch (err) { return null; }
}

async function generateAuditPDF(data) {
    const doc = new jsPDF();
    doc.setFillColor(30, 30, 30); doc.rect(0, 0, 210, 45, 'F');
    doc.setTextColor(212, 175, 55); doc.setFontSize(22); doc.text("ZaHouse Forensic Audit", 20, 25);
    doc.setTextColor(0, 0, 0); doc.text(`FINAL SCORE: ${data.score}/100`, 20, 65);
    doc.setFontSize(10); doc.text(doc.splitTextToSize(data.verdict, 180), 20, 80);
    return Buffer.from(doc.output('arraybuffer'));
}

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

app.post('/download-audit', async (req, res) => {
    const pdfBuffer = await generateAuditPDF(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
});

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message } = req.body;
    let isAudit = false, contextData = "";
    try {
        if (req.file) {
            isAudit = true;
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT ===\n${pdfData.text.substring(0, 15000)}`;
            fs.unlinkSync(req.file.path);
        } else if (message.toLowerCase().match(/news|latest|suno/)) {
            const webResult = await searchWeb(message);
            if (webResult) contextData = webResult;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: ZAHOUSE_SYSTEM_INSTRUCTIONS },
                { role: "user", content: (message || "Hello") + contextData }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.8,
        });

        res.json({ response: chatCompletion.choices[0]?.message?.content, isAudit: isAudit });
    } catch (err) { res.status(400).json({ response: "System Error." }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Fixed on ${PORT}`));
