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

// --- MASTER STRATEGIST INSTRUCTIONS ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker. You are here to decode the complex music industry for artists and labels.

GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details (Name, Email, Socials) to build a long-term relationship.

THE "SOFT SELL" PROTOCOL:
1. Value First: Answer the legal question first. Prove you know your stuff.
2. The "Hook": After giving value, pivot to the relationship.
3. The "Close": If they seem overwhelmed, offer the lifeline: "Look, this is heavy stuff. ZaHouse engineers equity. If you want us to step in and negotiate this for you, fill out the contact form below."

FORMATTING RULES (CRITICAL):
1. Use ### for all Section Headers.
2. Use **Bold** for key terms.
3. Use > Blockquotes for your "Strategy Notes".
4. Never output raw JSON unless specifically asked for the Scorecard.

TONE & STYLE:
- Authority with Swagger: Speak with absolute confidence.
- Metaphorical Master: Use "Bricks vs. Dirt" logic.
- Urban & Professional: "Points," "Equity," "Leverage."

VISUAL SCORECARD PROTOCOL:
If a contract is uploaded, you MUST output this EXACT Markdown Table:

### FORENSIC DEAL SCORE: [Score]/100

| METRIC | RATING (0-10) | ARCHITECT'S NOTES |
| :--- | :---: | :--- |
| Ownership | [X]/10 | [Note] |
| Recoupment | [X]/10 | [Note] |
| Control | [X]/10 | [Note] |
| Term | [X]/10 | [Note] |
| Transparency | [X]/10 | [Note] |

VERDICT: [Real Talk summary using metaphors]
`;

// --- CORE UTILITIES ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", include_answer: true, max_results: 3 })
        });
        const data = await response.json();
        return `\n\n=== STREET INTEL ===\n${data.answer}`;
    } catch (err) { return null; }
}

async function generateAuditPDF(data) {
    const doc = new jsPDF();
    doc.setFillColor(30, 30, 30); doc.rect(0, 0, 210, 45, 'F');
    doc.setTextColor(212, 175, 55); doc.setFontSize(22); doc.text("ZaHouse Forensic Audit", 20, 25);
    doc.setTextColor(0, 0, 0); doc.text(`FINAL SCORE: ${data.score}/100`, 20, 65);
    doc.setFontSize(10); doc.text(doc.splitTextToSize(data.verdict || "", 180), 20, 80);
    return Buffer.from(doc.output('arraybuffer'));
}

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

// --- DATA STORAGE ---
const LEADS_FILE = path.join(__dirname, 'leads.json');
const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json'); // NEW: Stores contact form submissions

if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([]));
if (!fs.existsSync(INQUIRIES_FILE)) fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([]));

// 1. SIMPLE EMAIL CAPTURE (The Gate)
app.post('/capture-lead', (req, res) => {
    const { email, type } = req.body;
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE));
    if (!leads.find(l => l.email === email)) {
        leads.push({ email, type: type || 'GATE', date: new Date().toISOString() });
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads));
    }
    res.json({ success: true });
});

// 2. DETAILED NEGOTIATION FORM (The Button)
app.post('/submit-inquiry', (req, res) => {
    const { name, email, artist, ipi, pro } = req.body;
    const inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE));
    inquiries.push({ name, email, artist, ipi, pro, date: new Date().toISOString() });
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries));
    res.json({ success: true });
});

app.post('/download-audit', async (req, res) => {
    const pdfBuffer = await generateAuditPDF(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
});

// 🔥 THE REVENUE GATE ROUTE 🔥
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, email } = req.body;
    let isAudit = false, contextData = "";

    // 1. CHECK IF EMAIL IS MISSING
    if (req.file && (!email || email === 'null' || email === '')) {
        if (req.file) fs.unlinkSync(req.file.path); 
        return res.json({ response: "", requiresEmail: true });
    }

    try {
        if (req.file) {
            isAudit = true;
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT ===\n${pdfData.text.substring(0, 15000)}`;
            fs.unlinkSync(req.file.path);
        } else if (message && message.toLowerCase().match(/news|latest|suno/)) {
            const webResult = await searchWeb(message);
            if (webResult) contextData = webResult;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: ZAHOUSE_SYSTEM_INSTRUCTIONS },
                { role: "user", content: (message || "Hello") + contextData }
            ],
            // 🔥 USING LLAMA 3.3 (Active)
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            max_tokens: 8000
        });

        res.json({ response: chatCompletion.choices[0]?.message?.content, isAudit: isAudit });

    } catch (err) { 
        console.error(err);
        res.status(400).json({ response: "System Error: " + err.message }); 
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Master Protocol on ${PORT}`));
