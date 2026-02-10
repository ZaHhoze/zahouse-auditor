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

// Enable X-Ray Logging so we can see if it works
app.use((req, res, next) => {
  console.log(`[X-RAY] Incoming Request: ${req.method} ${req.path}`);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS 🔥
const SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist.
GOAL: Provide legal strategy and gather user details.
TONE: Authority with Swagger. "Real Talk".
FORMAT: Use Markdown headers (###) and bold key terms.
`;

// ==========================================
// ✅ THE UNIVERSAL HANDLER
// ==========================================
async function handleChat(req, res) {
  console.log("💬 Processing Chat Request...");
  
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing in Railway." });
  }

  try {
    const userMessage = req.body.message || req.body.prompt;
    if (!userMessage) return res.json({ reply: "⚠️ Error: You didn't type anything." });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      // 🚨 THIS IS THE FIX: Using the newest stable model ID
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    console.log("✅ Success! Sending reply.");
    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error("❌ CLAUDE ERROR:", error);
    // If this fails, we will see the exact reason in the chat
    res.json({ reply: `⚠️ BRAIN ERROR: ${error.message}` });
  }
}

// ==========================================
// ✅ ROUTES
// ==========================================
app.post('/chat', handleChat);
app.post('/api/chat', handleChat);

app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    console.log("📄 Processing Audit Request...");
    let contractText = "";
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path);
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    const message = await anthropic.messages.create({
      // 🚨 THIS IS THE FIX
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Visual Scorecard Protocol:\n${contractText}` }]
    });

    res.json({ analysis: message.content[0].text });

  } catch (error) {
    console.error("❌ AUDIT ERROR:", error);
    res.json({ analysis: `⚠️ ERROR: ${error.message}` });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ ZaHouse Auditor is Online on port ${port}`);
});
