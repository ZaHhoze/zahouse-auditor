require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 8080;

// 🧠 THE BRAIN (Updated to your selection in Screenshot 9.26.38)
const MODEL_ID = "claude-sonnet-4-5-20250929";

app.use(cors());
app.use(express.json());
// ⚡️ Cache static files for speed
app.use(express.static('public', { maxAge: '1d' }));

// 🛡️ SAFETY: Extend timeout to 30s so the Frontend doesn't panic
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    console.log('⚠️ Request timed out.');
    if (!res.headersSent) res.status(408).send('Request timed out');
  });
  console.log(`[TRAFFIC] ${req.method} request to: ${req.path}`);
  next();
});

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS (Fully Restored) 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
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

VISUAL SCORECARD PROTOCOL:
If a contract is uploaded (PDF), you MUST output this EXACT Markdown Table at the top:

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

// ✅ THE MASTER HANDLER
async function handleRequest(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing in Railway." });
  }

  try {
    let userPrompt = "";

    // 1. FILE DETECTED? (Audit Mode)
    if (req.file) {
      console.log("📄 PDF Uploaded");
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      userPrompt = `Visual Scorecard Protocol:\n${data.text}`;
      fs.unlinkSync(req.file.path);
    } 
    // 2. TEXT DETECTED? (Chat Mode)
    else {
      // Logic: If user hits /audit but sends no file, treat it as chat
      userPrompt = req.body.message || req.body.prompt || "Hello";
      console.log(`💬 Text Received: "${userPrompt.substring(0, 20)}..."`);
    }

    // 3. CALL CLAUDE
    console.log(`🤖 Consulting Strategist (${MODEL_ID})...`);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: MODEL_ID, // claude-sonnet-4-5-20250929
      max_tokens: 3000,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    });

    const replyText = response.content[0].text;
    console.log("✅ Strategist Replied");

    // 4. SEND RESPONSE (Shotgun Format)
    res.json({ 
      reply: replyText,
      analysis: replyText,
      message: replyText,
      response: replyText
    });

  } catch (error) {
    console.error("❌ ERROR:", error);
    // Send error as a visible message so we know what happened
    res.json({ 
      reply: `⚠️ BRAIN ERROR: ${error.message}`,
      analysis: `⚠️ BRAIN ERROR: ${error.message}`
    });
  }
}

// ✅ ROUTES (All Doors Open)
app.post('/chat', upload.single('contract'), handleRequest);
app.post('/api/chat', upload.single('contract'), handleRequest);
app.post('/audit', upload.single('contract'), handleRequest);
app.post('/api/audit', upload.single('contract'), handleRequest);

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ ZaHouse Strategist Online (Port ${port})`);
  console.log(`🧠 Model: ${MODEL_ID}`);
});
