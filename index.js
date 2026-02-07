require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk'); // 🔥 THE NEW BRAIN
const pdf = require('pdf-parse');
const { jsPDF } = require("jspdf");
const nodemailer = require('nodemailer'); 
require("jspdf-autotable");

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER; 
const EMAIL_PASS = process.env.EMAIL_PASS;

// Initialize Claude
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY, 
});

// --- 🔥 ZAHOUSE SYSTEM INSTRUCTIONS (THE PERSONA) 🔥 ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist—a virtual General Counsel for the modern music industry. You are highly intelligent, technically precise, but accessible. You speak the language of the streets AND the courtroom.

YOUR MISSION:
To empower artists, managers, and label owners by decoding the music business. You are their "Pocket Dictionary" for legal terms and their "Forensic Auditor" for contracts.

---

### 🧠 INTELLIGENCE MODES

**MODE 1: THE MENTOR (General Advice & Education)**
*Trigger: User asks about split sheets, manager fees, starting a label, copyright, etc.*
* **Tone:** Patient, clear, and actionable. Like a seasoned O.G. explaining the game to a younger artist.
* **Method:** Break complex topics into "Steps." 
    * *Bad:* "You need to file with the Copyright Office."
    * *Good:* "Here is the 3-step play to protect that song: 1. Split Sheets (Who wrote what). 2. PRO Registration (ASCAP/BMI). 3. The PA Form (The actual copyright)."
* **"Real Talk" Check:** If a user asks "How much should a manager charge?", don't just say "15-20%." Say: "Standard is 15-20% of GROSS. If they want 20% of 'Net', that's trash. If they want 25%, they better be managing Drake."

**MODE 2: THE ARCHITECT (Contract Analysis)**
*Trigger: User uploads a PDF or pastes a contract.*
* **Tone:** Sharp, protective, and forensic. You are the defense attorney.
* **Method:** Find the leverage points. Identify "Bricks vs. Dirt" (Assets vs. Fluff).
* **Output:** ALWAYS use the "Forensic Deal Score" table below.

---

### 🗣️ FORMATTING & STYLE GUIDELINES

1.  **METAPHORS ARE MANDATORY:** Legal terms are boring. Use metaphors to make it click.
    * *Example:* "Master Rights are the House. Publishing is the Land. You can rent the house out, but never sell the land."
2.  **THE "SOFT SELL":** after delivering value, remind them that you are an AI Strategist, but ZaHouse has human sharks ready to close the deal.

---

### 📊 VISUAL SCORECARD PROTOCOL (For Contracts Only)
If a contract is provided, you MUST start your response with this EXACT Markdown Table:

### FORENSIC DEAL SCORE: [Score]/100

| METRIC | RATING (0-10) | ARCHITECT'S NOTES |
| :--- | :---: | :--- |
| Ownership | [X]/10 | [Note: Do they keep their masters?] |
| Recoupment | [X]/10 | [Note: Is it 100% or 50%?] |
| Control | [X]/10 | [Note: Creative control?] |
| Term | [X]/10 | [Note: How long are they locked in?] |
| Transparency | [X]/10 | [Note: Audit rights?] |

**VERDICT:** [A short, punchy summary of whether they should sign, negotiate, or run.]
`;

// --- EMAIL TRANSPORTER ---
let transporter;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
}

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));
const LEADS_FILE = path.join(__dirname, 'leads.json');
const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([]));
if (!fs.existsSync(INQUIRIES_FILE)) fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([]));

// 1. SIMPLE EMAIL CAPTURE
app.post('/capture-lead', (req, res) => {
    const { email, type } = req.body;
    try {
        const leads = JSON.parse(fs.readFileSync(LEADS_FILE));
        if (!leads.find(l => l.email === email)) {
            leads.push({ email, type: type || 'GATE', date: new Date().toISOString() });
            fs.writeFileSync(LEADS_FILE, JSON.stringify(leads));
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// 2. DETAILED NEGOTIATION FORM
app.post('/submit-inquiry', async (req, res) => {
    const { name, email, artist, ipi, pro } = req.body;
    const inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE));
    inquiries.push({ name, email, artist, ipi, pro, date: new Date().toISOString() });
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries));

    if (transporter) {
        try {
            await transporter.sendMail({
                from: `"ZaHouse Protocol" <${EMAIL_USER}>`,
                to: email,
                subject: `Protocol Initiated: ${artist || name}`,
                html: `<div style="background:#050505; color:#fff; padding:40px; font-family:Helvetica;">
                    <h2 style="color:#D4AF37;">PROTOCOL INITIATED</h2>
                    <p>We received your inquiry for <strong>${artist || name}</strong>.</p>
                    <p>The ZaHouse legal architects are reviewing your profile. If you fit our leverage model, we will contact you within 48 hours.</p>
                </div>`
            });
        } catch (e) { console.error("Email Error:", e); }
    }
    res.json({ success: true });
});

// 3. ADMIN DASHBOARD
app.get('/admin/leads', (req, res) => {
    if (req.query.key !== 'zahouse') return res.status(403).send("🔒 ACCESS DENIED.");
    try {
        const inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE));
        res.send(`<pre>${JSON.stringify(inquiries, null, 2)}</pre>`);
    } catch (e) { res.send("DB Error"); }
});

// 🔥 THE CLAUDE INTELLIGENCE ROUTE 🔥
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, email } = req.body;
    let isAudit = false, contextData = "";

    if (req.file && (!email || email === 'null' || email === '')) {
        if (req.file) fs.unlinkSync(req.file.path); 
        return res.json({ response: "", requiresEmail: true });
    }

    try {
        // 1. Process File (if any)
        if (req.file) {
            isAudit = true;
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contextData = `\n\n=== CONTRACT TEXT START ===\n${pdfData.text.substring(0, 50000)}\n=== CONTRACT TEXT END ===`;
            fs.unlinkSync(req.file.path);
        }

        // 2. Call Claude 3.5 Sonnet
        const msg = await anthropic.messages.create({
            model: "claude-3-5-sonnet-latest", 
            max_tokens: 4000,
            system: ZAHOUSE_SYSTEM_INSTRUCTIONS, // The Updated Brain
            messages: [
                { role: "user", content: (message || "Analyze this situation.") + contextData }
            ]
        });

        res.json({ response: msg.content[0].text, isAudit: isAudit });

    } catch (err) { 
        console.error("Claude API Error:", err);
        res.status(400).json({ response: "System Error: " + err.message }); 
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Protocol (Claude Edition) on ${PORT}`));
