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

// 🔥 ZAHOUSE INSTRUCTIONS (Restored) 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker.
GOAL: Provide legal strategy and gather user details (Name, Email, IG).
THE SOFT SELL: Answer the legal question first, then pivot to asking for their Artist Name or IG.
TONE: Authority with Swagger. "Real Talk". Use metaphors.
FORMAT: Use Markdown headers (###) and bold key terms.
`;

// ✅ DIAGNOSIS SCREEN (The Welcome Page)
// This will tell us INSTANTLY if the Key is missing or the code is broken.
app.get('/', (req, res) => {
  let status = "🔴 OFFLINE";
  let details = "";
  
  // 1. Check Key
  if (process.env.ANTHROPIC_API_KEY) {
    status = "🟡 KEY FOUND";
    // 2. Check Key Format
    if (process.env.ANTHROPIC_API_KEY.startsWith("sk-ant")) {
      status = "🟢 ONLINE & READY";
      details = "System is healthy. The Strategist is waiting.";
    } else {
      status = "🟠 KEY INVALID";
      details = "The API Key exists but looks wrong (must start with 'sk-ant').";
    }
  } else {
    status = "🔴 KEY MISSING";
    details = "FATAL ERROR: No API Key found in Railway Variables.";
  }

  res.send(`
    <div style="font-family: sans-serif; background: #111; color: #fff; padding: 50px; text-align: center;">
      <h1>ZaHouse Auditor Status</h1>
      <h2 style="font-size: 40px;">${status}</h2>
      <p>${details}</p>
      <hr style="border-color: #333; margin: 30px 0;">
      <p style="color: #666;">If this says 🟢 ONLINE, try typing 'Hello' in the chat again.</p>
    </div>
  `);
});

// ✅ CHAT ROUTE
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.prompt;
    if (!userMessage) return res.json({ reply: "⚠️ Error: Empty message." });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing from Railway." });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1500,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("Chat Error:", error);
    res.json({ reply: `⚠️ BRAIN ERROR: ${error.message}` });
  }
});

// ✅ AUDIT ROUTE
app.post('/audit', upload.single('contract'), async (req, res) => {
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
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
