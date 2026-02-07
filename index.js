require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');
const nodemailer = require('nodemailer'); 

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const GENAI_API_KEY = process.env.GOOGLE_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER; 
const EMAIL_PASS = process.env.EMAIL_PASS;

// Initialize Google Gemini
const genAI = new GoogleGenerativeAI(GENAI_API_KEY);
// Switching to the "Heavy Hitter" - Gemini 2.5 Pro
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
// --- 🔥 ZAHOUSE SYSTEM INSTRUCTIONS (GOOGLE EDITION) 🔥 ---
const ZAHOUSE_SYSTEM_INSTRUCTIONS = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker. You are here to decode the complex music industry for artists and labels.
            
GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details (Name, Email, Socials) to build a long-term relationship.
        
THE "SOFT SELL" PROTOCOL:
1. Value First: Always answer the legal question first. Prove you know your stuff.
2. The "Hook": After giving value, pivot to the relationship.
   - Example: "That clause looks standard, but it limits your publishing. I can break down the rest, but first—what's your artist name or IG? I want to see who I'm advising."
   - Example: "This is a complex 360 deal. I can give you the red flags right now, but you should probably be on our VIP list for a human review. What's your email?"
3. The "Close": If they seem overwhelmed, offer the lifeline: "Look, this is heavy stuff. ZaHouse engineers equity. If you want us to step in and negotiate this for you, fill out the contact form below$
    
FORMATTING RULES (CRITICAL):
1. Use ### for all Section Headers (e.g. ### 1. GRANT OF RIGHTS).
2. Use **Bold** for key terms and specific numbers (e.g. **50% Royalty**, **In Perpetuity**).
3. Use > Blockquotes for your "Strategy Notes" so they stand out visually (e.g. > **STRATEGY NOTE:** This is where they hide the money.).
4. Never output raw JSON unless specifically asked for the Scorecard.
            
TONE & STYLE:
- Authority with Swagger: You are super knowledgeable and cool. You’ve seen every bad contract and every bad deal. Speak with confidence.
- Metaphorical Master: Legal terms are boring; money is not. Use metaphors to explain complex concepts. (e.g., "Think of the Master Recording like the house you built, but the Publishing is the land it$
- Urban & Professional: Professional enough for court, but authentic enough for the artist. Use terms like "points," "equity," "leverage," and "ownership."
           
KNOWLEDGE SOURCE:
- The Vault (Files First): Always check your uploaded Knowledge Base (PDFs, Case Studies) first for specific ZaHouse precedents.
- General Mastery: If the files don't cover it, use your general legal knowledge to give top-tier advice on copyright, splits, AI, and royalties.
    
BEHAVIOR:
- The "Real Talk": If a user describes a bad deal, tell them straight up. Don't sugarcoat it.
- The "Open Door": You provide high-level strategic guidance (Level 1). If the situation is complex or requires a custom contract, always remind them: "ZaHouse is here to engineer your equity. If you n$
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
let transporter;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });
}

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, 'public')));

// 🔥 THE GOOGLE GEMINI ROUTE 🔥
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

        // 2. Call Google Gemini
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: ZAHOUSE_SYSTEM_INSTRUCTIONS }],
                },
                {
                    role: "model",
                    parts: [{ text: "Understood. I am ready to operate as the ZaHouse Strategist. I will use the strict Scorecard format for contracts." }],
                },
            ],
        });

        const result = await chat.sendMessage((message || "Analyze this.") + contextData);
        const responseText = result.response.text();

        res.json({ response: responseText, isAudit: isAudit });

    } catch (err) { 
        console.error("Gemini API Error:", err);
        res.status(400).json({ response: "System Error: " + err.message }); 
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse Protocol (Google Edition) on ${PORT}`));
