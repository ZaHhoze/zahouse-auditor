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

// 🚨 CRITICAL FIX: This matches your Screenshot
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker.
GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details (Name, Email, Socials).
THE SOFT SELL: Always answer the legal question first. Then pivot: "That clause looks standard, but I want to see who I'm advising. What's your artist name or IG?"
TONE: Authority with Swagger. "Real Talk". Use metaphors.
VISUALS: Use ### Headers and **Bold** for key money terms.
`;

// ==========================================
// ✅ THE HANDLER (Updated Model)
// ==========================================
async function handleChat(req, res) {
  console.log(`[INCOMING] Chat Request on ${req.path}`);
  
  // 1. Check Key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ API Key Missing");
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing in Railway Variables." });
  }

  try {
    const userMessage = req.body.message || req.body.prompt;
    if (!userMessage) return res.json({ reply: "⚠️ Error: You didn't type anything." });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 2. Call the New Model
    console.log(`[CONNECTING] Using model: ${CLAUDE_MODEL}`);
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL, // "claude-sonnet-4-5-20250929"
      max_tokens: 1500,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    console.log("✅ Success!");
    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("❌ CLAUDE ERROR:", error);
    // This will print the error inside your chat window so we can see it
    res.json({ 
      reply: `⚠️ BRAIN ERROR: ${error.message}\n\n(Model: ${CLAUDE_MODEL})` 
    });
  }
}

// ==========================================
// ✅ ROUTES (Open All Doors)
// ==========================================
app.post('/chat', handleChat);
app.post('/api/chat', handleChat);

app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    console.log("📄 Audit Request Received");
    let contractText = "";
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path);
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    // Force Scorecard Mode
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Visual Scorecard Protocol:\n${contractText}` }]
    });

    res.json({ analysis: message.content[0].text });

  } catch (error) {
    console.error("❌ AUDIT ERROR:", error);
    res.json({ analysis: `⚠️ ERROR: ${error.message}` });
  }
});

// Fallback for UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ ZaHouse Auditor is Online on port ${port}`);
  console.log(`🤖 Configured for Model: ${CLAUDE_MODEL}`);
});
