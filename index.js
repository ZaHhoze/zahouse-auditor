require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');
const { jsPDF } = require("jspdf");
const nodemailer = require('nodemailer'); // 🔥 REQUIRED FOR EMAILS
require("jspdf-autotable");

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const EMAIL_USER = process.env.dcrutch745@gmail.com; // Your Gmail Address
const EMAIL_PASS = process.env.ekbl ltla qujm zdhk; // Your Gmail App Password

const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- YOUR EXACT CUSTOM INSTRUCTIONS ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker. You are here to decode the complex music industry for artists and labels.

GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details (Name, Email, Socials) to build a long-term relationship.

THE "SOFT SELL" PROTOCOL:
1. Value First: Always answer the legal question first. Prove you know your stuff.
2. The "Hook": After giving value, pivot to the relationship.
   - Example: "That clause looks standard, but it limits your publishing. I can break down the rest, but first—what's your artist name or IG? I want to see who I'm advising."
   - Example: "This is a complex 360 deal. I can give you the red flags right now, but you should probably be on our VIP list for a human review. What's your email?"
3. The "Close": If they seem overwhelmed, offer the lifeline: "Look, this is heavy stuff. ZaHouse engineers equity. If you want us to step in and negotiate this for you, fill out the contact form below."

FORMATTING RULES (CRITICAL):
1. Use ### for all Section Headers (e.g. ### 1. GRANT OF RIGHTS).
2. Use **Bold** for key terms and specific numbers (e.g. **50% Royalty**, **In Perpetuity**).
3. Use > Blockquotes for your "Strategy Notes" so they stand out visually (e.g. > **STRATEGY NOTE:** This is where they hide the money.).
4. Never output raw JSON unless specifically asked for the Scorecard.

TONE & STYLE:
- Authority with Swagger: You are super knowledgeable and cool. You’ve seen every bad contract and every bad deal. Speak with confidence.
- Metaphorical Master: Legal terms are boring; money is not. Use metaphors to explain complex concepts. (e.g., "Think of the Master Recording like the house you built, but the Publishing is the land it sits on.")
- Urban & Professional: Professional enough for court, but authentic enough for the artist. Use terms like "points," "equity," "leverage," and "ownership."

KNOWLEDGE SOURCE:
- The Vault (Files First): Always check your uploaded Knowledge Base (PDFs, Case Studies) first for specific ZaHouse precedents.
- General Mastery: If the files don't cover it, use your general legal knowledge to give top-tier advice on copyright, splits, AI, and royalties.

BEHAVIOR:
- The "Real Talk": If a user describes a bad deal, tell them straight up. Don't sugarcoat it.
- The "Open Door": You provide high-level strategic guidance (Level 1). If the situation is complex or requires a custom contract, always remind them: "ZaHouse is here to engineer your equity. If you need deeper help, hit the button."
- Disclaimer: Always end with a brief reminder that this is strategic guidance, not binding legal advice.

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

// --- EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// --- UTILITIES ---
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
const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');

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

// 2. DETAILED NEGOTIATION FORM + AUTO-REPLY EMAIL
app.post('/submit-inquiry', async (req, res) => {
    const { name, email, artist, ipi, pro } = req.body;
    
    // Save to Database
    const inquiries = JSON.parse(fs.readFileSync(INQUIRIES_FILE));
    inquiries.push({ name, email, artist, ipi, pro, date: new Date().toISOString() });
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries));

    // 🔥 SEND AUTO-REPLY EMAIL 🔥
    if (EMAIL_USER && EMAIL_PASS) {
        const mailOptions = {
            from: `"ZaHouse Protocol" <${EMAIL_USER}>`,
            to: email,
            subject: `Protocol Initiated: ${artist || name}`,
            html: `
                <div style="background:#050505; color:#fff; padding:40px; font-family:Helvetica, sans-serif; border:1px solid #333;">
                    <h2 style="color:#D4AF37; margin-top:0;">PROTOCOL INITIATED</h2>
                    <p style="color:#ccc;">Greetings ${name.split(' ')[0]},</p>
                    <p style="color:#ccc; line-height:1.6;">We have received your request for representation. The ZaHouse legal architects are currently reviewing your profile for <strong>${artist || "your brand"}</strong>.</p>
                    <p style="color:#ccc; line-height:1.6;"><strong>We do not do cookie-cutter deals.</strong> We engineer equity. If your situation fits our leverage model, a strategist will contact you via this secure line within 48 hours.</p>
                    <br>
                    <div style="border-left: 3px solid #D4AF37; padding-left: 15px; color:#888; background:#111; padding:15px;">
                        <strong style="color:#D4AF37;">SUBMISSION LOG:</strong><br>
                        IPI: ${ipi || "N/A"}<br>
                        PRO: ${pro || "N/A"}
                    </div>
                    <br>
                    <p style="color:#ccc;">Standby.</p>
                    <p style="color:#D4AF37; font-weight:bold;">ZaHouse Legal Team</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("Auto-reply sent to:", email);
        } catch (error) {
            console.error("Email Error:", error);
        }
    }

    res.json({ success: true });
});

// SECRET ADMIN DASHBOARD (your-url/admin/leads?key=zahouse)
app.get('/admin/leads', (req, res) => {
    if (req.query.key !== 'zahouse') return res.status(403).send("🔒 ACCESS DENIED.");
    try {
        const inquiries = JSON.parse(fs.existsSync(INQUIRIES_FILE) ? fs.readFileSync(INQUIRIES_FILE) : "[]");
        const gateLeads = JSON.parse(fs.existsSync(LEADS_FILE) ? fs.readFileSync(LEADS_FILE) : "[]");
        let html = `<html><body style="background:#111;color:#fff;font-family:sans-serif;padding:40px;">
            <h1 style="color:#D4AF37">Negotiation Requests</h1>
            <table style="width:100%; text-align:left; border-collapse:collapse; margin-bottom:40px;">
                <tr style="border-bottom:2px solid #D4AF37; color:#D4AF37;"><th>Date</th><th>Name</th><th>Artist</th><th>Email</th><th>Details</th></tr>
                ${inquiries.map(i => `<tr style="border-bottom:1px solid #333;">
                    <td style="padding:10px;">${new Date(i.date).toLocaleDateString()}</td>
                    <td>${i.name}</td>
                    <td>${i.artist}</td>
                    <td><a href="mailto:${i.email}" style="color:#fff">${i.email}</a></td>
                    <td>${i.ipi || '-'} / ${i.pro || '-'}</td>
                </tr>`).join('')}
            </table>
            <h1 style="color:#D4AF37">Gate Unlocks</h1>
            <ul style="color:#ccc;">
            ${gateLeads.map(l => `<li>${new Date(l.date).toLocaleDateString()} - <a href="mailto:${l.email}" style="color:#ccc">${l.email}</a></li>`).join('')}
            </ul>
        </body></html>`;
        res.send(html);
    } catch (e) { res.send("DB Error"); }
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
