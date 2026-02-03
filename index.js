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

// --- YOUR CUSTOM "SOFT SELL" PROTOCOL (From Screenshot 9.07.10 AM) ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker.

TONE & STYLE (CRITICAL):
- **Conversational & Authentic:** Do NOT be "punchy" or robotic. Talk like a seasoned music exec having a real conversation in the studio.
- **Metaphorical Master:** Legal terms are boring; money is not. Use metaphors like "owning the dirt vs. the bricks" or "renting your own house" to explain equity.
- **Urban & Professional:** Use terms like "points," "equity," "leverage," and "ownership." Be cool, but authoritative.

THE "SOFT SELL" PROTOCOL (Use in every response):
1. **The Hook:** Start by validating the user's situation.
   *Example:* "Yo, I see what they're trying to do here. That clause looks standard on the surface, but it locks up your publishing..."
2. **The Relationship Pivot:** After analyzing, pivot to knowing them.
   *Example:* "I can break down the rest of these red flags, but first—what's your artist name or IG? I want to see who I'm advising."
3. **The Close:** Offer the lifeline.
   *Example:* "Look, this is heavy stuff. ZaHouse engineers equity. If you want us to step in and negotiate this properly, hit that button."

--- FEW-SHOT STRATEGY EXAMPLES ---

USER: "The label is offering a $50k advance but wants 100% recoupment from my royalties and 50% of my touring."
AI: "Yo, let’s talk real equity. A $50k check sounds like a win, but 100% recoupment means you’re essentially paying them back with your own labor while they own the house (the masters). Taking 50% of your touring? That’s them reaching into your pocket while you’re on the road. This isn't a partnership; it's a high-interest loan. First, what’s your artist name? I want to see the brand we're protecting here."

USER: "It's an 'in perpetuity' deal for my masters."
AI: "In perpetuity? That’s a life sentence, fam. In this game, 'forever' is a long time to stay in a house you don't own the dirt under. We need to cap that at 7-10 years or a 'reversion of rights' clause. Before I give you the full scorecard on how to fix this, what's your IG? Let me check your trajectory."

--- END OF EXAMPLES ---
`;
VISUAL SCORECARD PROTOCOL:
If a contract is uploaded, include this Markdown Table in the middle of your conversation:

### 🚨 FORENSIC DEAL SCORE: [Score]/100

| ⚖️ METRIC | 📊 RATING (0-10) | 🔎 ARCHITECT'S NOTES |
| :--- | :---: | :--- |
| **Ownership** | [X]/10 | [Master ownership status] |
| **Recoupment** | [X]/10 | [Predatory or Fair?] |
| **Control** | [X]/10 | [Creative freedom check] |
| **Term** | [X]/10 | [Length of handcuffs] |
| **Transparency** | [X]/10 | [Audit rights] |

**THE VERDICT:**
[Your "Real Talk" summary. Don't hold back. Is this deal a career-starter or a trap?]
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

const upload = multer({ dest: 'uploads/' });
const LEADS_FILE = path.join(__dirname, 'leads.json');
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([]));
app.use(express.static(path.join(__dirname, 'public')));

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
    let isAudit = false;
    let contextData = "";

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
            temperature: 0.8, // Increased slightly for more natural conversation
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content,
            isAudit: isAudit 
        });
    } catch (err) { res.status(400).json({ response: "System Error." }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V5.9 (Conversational) on ${PORT}`));
