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

// ✅ CHAT ROUTE (TROJAN HORSE MODE)
// We force the server to say "Success" even if it fails, so you can see the error.
app.post('/chat', async (req, res) => {
  try {
    console.log("💬 Chat request received.");

    // 1. CHECK API KEY
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("❌ API Key is missing");
      return res.json({ 
        reply: "⚠️ DIAGNOSTIC: I cannot find your API Key. Please go to Railway -> Variables and add ANTHROPIC_API_KEY." 
      });
    }

    // 2. CHECK MESSAGE
    const userMessage = req.body.message || req.body.prompt;
    if (!userMessage) {
      return res.json({ reply: "⚠️ DIAGNOSTIC: You sent an empty message." });
    }

    // 3. ATTEMPT CLAUDE CONNECTION
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1500,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    // SUCCESS!
    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("❌ CRASH:", error);
    // TRICK: Send the error as a chat message
    res.json({ 
      reply: `⚠️ CRITICAL ERROR: ${error.message}\n\n(This means the API Key might be invalid or your quota is empty.)` 
    });
  }
});

// ✅ AUDIT ROUTE
app.post('/audit', upload.single('contract'), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
     return res.json({ analysis: "⚠️ API Key is missing. Check Railway." });
  }

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
