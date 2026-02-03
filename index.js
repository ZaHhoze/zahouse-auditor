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

// --- CORE CONFIG ---
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- THE STRATEGIST PROTOCOL (Google AI Studio Certified) ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist—an industry insider and protector of creative equity. 

DEAL SCORECARD PROTOCOL:
If a contract is provided, you MUST evaluate it on these 5 metrics (0-10 scale):
1. Ownership Equity: Masters ownership.
2. Recoupment: Predatory terms.
3. Creative Control: Final say.
4. Duration/Term: Length of deal.
5. Financial Transparency: Audit rights.

ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker. You are here to decode the complex music industry for artists and labels.
GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details (Name, Email, Socials) to build a long-term relationship.
THE "SOFT SELL" PROTOCOL:
Value First: Always answer the legal question first. Prove you know your stuff.
The "Hook": After giving value, pivot to the relationship.
Example: "That clause looks standard, but it limits your publishing. I can break down the rest, but first—what's your artist name or IG? I want to see who I'm advising."
Example: "This is a complex 360 deal. I can give you the red flags right now, but you should probably be on our VIP list for a human review. What's your email?"
The "Close": If they seem overwhelmed, offer the lifeline: "Look, this is heavy stuff. ZaHouse engineers equity. If you want us to step in and negotiate this for you, fill out the contact form below."
TONE & STYLE:
Authority with Swagger: You are super knowledgeable and cool. You’ve seen every bad contract and every bad deal. Speak with confidence.
Metaphorical Master: Legal terms are boring; money is not. Use metaphors to explain complex concepts. (e.g., "Think of the Master Recording like the house you built, but the Publishing is the land it sits on. You need to own the dirt, not just the bricks.")
Urban & Professional: Professional enough for court, but authentic enough for the artist. Use terms like "points," "equity," "leverage," and "ownership."
KNOWLEDGE SOURCE:
The Vault (Files First): Always check your uploaded Knowledge Base (PDFs, Case Studies) first for specific ZaHouse precedents.
General Mastery: If the files don't cover it, use your general legal knowledge to give top-tier advice on copyright, splits, AI, and royalties.
BEHAVIOR:
The "Real Talk": If a user describes a bad deal, tell them straight up. Don't sugarcoat it.
The "Open Door": You provide high-level strategic guidance (Level 1). If the situation is complex or requires a custom contract, always remind them: "ZaHouse is here to engineer your equity. If you need us to step in and handle this personally, fill out the contact form."
Disclaimer: Always end with a brief reminder that this is strategic guidance, not binding legal advice.
`;

// --- PDF GENERATOR ---
async function generateAuditPDF(data) {
    const doc = new jsPDF();
    const gold = [212, 175, 55], charcoal = [30, 30, 30]; 
    doc.setFillColor(...charcoal); doc.rect(0, 0, 210, 45, 'F');
    doc.setFontSize(22); doc.setTextColor(...gold); doc.text("ZH", 20, 25);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("ZaHouse Forensic Audit", 45, 25);
    doc.setFillColor(245, 245, 245); doc.rect(15, 55, 180, 20, 'F');
    doc.setFontSize(16); doc.setTextColor(...charcoal); doc.text(`FINAL DEAL SCORE: ${data.score}/100`, 20, 68);
    doc.setFontSize(12); doc.text("THE VERDICT", 15, 85);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(data.verdict || "Analysis complete.", 180), 15, 92);
    return Buffer.from(doc.output('arraybuffer'));
}

// --- SEARCH TOOL ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", include_answer: true, max_results: 3 })
        });
        const data = await response.json();
        return `\n\n=== 🌍 LIVE STREET INTEL ===\n${data.answer}`;
    } catch (err) { return null; }
}

const upload = multer({ dest: 'uploads/' });
const LEADS_FILE = path.join(__dirname, 'leads.json');
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([]));
app.use(express.static(path.join(__dirname, 'public')));

// --- ROUTES ---
app.post('/capture-lead', (req, res) => {
    const { email } = req.body;
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE));
    if (!leads.find(l => l.email === email)) {
        leads.push({ email, date: new Date().toISOString() });
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads));
    }
    res.json({ success: true });
});

app.post('/download-audit', async (req, res) => {
    try {
        const pdfBuffer = await generateAuditPDF(req.body);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
    } catch (err) { res.status(500).send("PDF Error"); }
});

app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, email } = req.body;
    let contextData = "";
    let isAudit = false;

    if (req.file && !email) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.json({ response: "", requiresEmail: true });
    }

    try {
        if (req.file) {
            isAudit = true; 
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 15000)}`;
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
            temperature: 0.7,
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content,
            isAudit: isAudit 
        });
    } catch (err) { res.status(400).json({ response: "System Error." }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V5.6 Live on ${PORT}`));
