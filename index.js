require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Keeps your UI alive

const upload = multer({ dest: 'uploads/' });

// 🔥 THE ZAHOUSE STRATEGIST BRAIN 🔥
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

BEHAVIOR:
- The "Real Talk": If a user describes a bad deal, tell them straight up. Don't sugarcoat it.
- The "Open Door": You provide high-level strategic guidance (Level 1). If the situation is complex or requires a custom contract, always remind them: "ZaHouse is here to engineer your equity."
- Disclaimer: Always end with a brief reminder that this is strategic guidance, not binding legal advice.

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

// ✅ CHAT ROUTE (Conversational)
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.prompt;
    
    if (!userMessage) return res.status(400).json({ error: "No message sent" });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1500,
      system: ZAHOUSE_SYSTEM_PROMPT, // Inject the Persona here
      messages: [
        { role: "user", content: userMessage }
      ]
    });

    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: "Strategist is offline", details: error.message });
  }
});

// ✅ AUDIT ROUTE (PDF Analysis)
app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    let contractText = "";
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path);
    } else {
      return res.status(400).json({ error: "No contract file uploaded." });
    }

    // Specific prompt for Audits to trigger the Scorecard
    const userPrompt = `I have uploaded a contract. Analyze it clause by clause using the Visual Scorecard Protocol.
    
    Contract Text:
    ${contractText}`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      system: ZAHOUSE_SYSTEM_PROMPT, // Inject the Persona here
      messages: [{ role: "user", content: userPrompt }]
    });

    res.json({ analysis: message.content[0].text });

  } catch (error) {
    console.error("Audit Error:", error);
    res.status(500).json({ error: "Audit failed", details: error.message });
  }
});

// Fallback for homepage
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
