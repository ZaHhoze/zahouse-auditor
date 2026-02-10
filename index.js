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

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker.
GOAL: Provide legal strategy and gather user details (Name, Email, IG).
THE SOFT SELL: Answer the legal question first, then pivot to asking for their Artist Name or IG.
TONE: Authority with Swagger. "Real Talk". Use metaphors.
FORMAT: Use Markdown headers (###) and bold key terms.
`;

// ==========================================
// ✅ THE SHARED BRAIN FUNCTION (Handles logic)
// ==========================================
async function handleChat(req, res) {
  console.log(`[INCOMING] ${req.method} ${req.path}`);
  
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ERROR: API Key is missing.");
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing in Railway." });
  }

  const userMessage = req.body.message || req.body.prompt || "Hello";

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1500,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("❌ CLAUDE ERROR:", error);
    res.json({ reply: `⚠️ BRAIN ERROR: ${error.message}` });
  }
}

// ==========================================
// ✅ THE ROUTE HANDLERS (Open All Doors)
// ==========================================

// 1. Listen for Chat on BOTH common paths
app.post('/chat', handleChat);
app.post('/api/chat', handleChat);

// 2. Listen for Audits on BOTH common paths
app.post('/audit', upload.single('contract'), handleAudit);
app.post('/api/audit', upload.single('contract'), handleAudit);

async function handleAudit(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ analysis: "⚠️ API Key missing." });

  try {
    let contractText = "";
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path);
    } else {
      return res.json({ analysis: "⚠️ No file uploaded." });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Visual Scorecard Protocol:\n${contractText}` }]
    });

    res.json({ analysis: message.content[0].text });

  } catch (error) {
    res.json({ analysis: `⚠️ ERROR: ${error.message}` });
  }
}

// 3. Fallback (Must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
