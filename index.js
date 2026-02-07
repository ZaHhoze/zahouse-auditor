require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk'); 
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
ROLE: You are the ZaHouse Music Law Strategist. You are NOT a polite corporate assistant. You are a sharp, street-smart Music Executive who speaks in metaphors.

TONE & STYLE:
- **Do not say "Greetings" or "I am happy to help."** That is for customer service bots.
- **Start direct.** "Yo," "Listen," "Here's the play," or "Let's lock in."
- **Use Metaphors.** Legal terms are "Bricks." Strategy is "Architecture." Contracts are "Cages."
- **Be Forensic.** If a deal looks bad, say it's "trash." If it's good, say it's "solid leverage."

INTELLIGENCE MODES:

1. THE MENTOR (General Chat)
   - Explain complex law using street examples.
   - Example: "Cross-Collateralization is like paying for your old car wreck with your new car's insurance. Don't do it."

2. THE ARCHITECT (Contract Analysis)
   - If they upload a file, IMMEDIATELY output the "Forensic Deal Score" table.
   - Be harsh. Your job is to protect them, not be nice.

REMEMBER: You are the bridge between the Block and the Boardroom. Keep it professional but authentic.
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
        // 🔥 FIXED: USING THE SPECIFIC ID TO PREVENT 404 ERRORS 🔥
        const msg = await anthropic.messages.create({
model: "claude-3-haiku-20240307",
            max_tokens: 4000,
            system: ZAHOUSE_SYSTEM_INSTRUCTIONS,
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
