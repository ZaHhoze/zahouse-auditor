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

// 🧠 LOCKED MODEL (Confirmed Working in Logs)
const MODEL_ID = "claude-sonnet-4-20250514";

app.use(cors());
app.use(express.json());
// ⚡️ SPEED FIX: Cache static files to load UI faster
app.use(express.static('public', { maxAge: '1d' }));

// 🔍 TRAFFIC LOGGER
app.use((req, res, next) => {
  // ⏳ EXTEND TIMEOUT: Tell the browser to wait up to 30 seconds
  res.setTimeout(30000, () => {
    console.log('⚠️ Request has timed out.');
    res.status(408).send('Request has timed out');
  });
  console.log(`[TRAFFIC] ${req.method} request to: ${req.path}`);
  next();
});

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist.
GOAL: Provide high-value, specific legal and strategic guidance.
THE SOFT SELL: Answer the legal question first. Then pivot to gathering details.
TONE: Authority with Swagger. "Real Talk".
`;

// ✅ THE "SHOTGUN" HANDLER
// Sends the response in every format so the Frontend can't miss it.
async function handleRequest(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing." });
  }

  try {
    let userPrompt = "";

    // 1. FAST PATH: If they just say "Hello", reply instantly (No API Call)
    // This confirms if the connection is working without waiting for Claude.
    const rawBody = req.body.message || req.body.prompt || "";
    if (!req.file && rawBody.toLowerCase().trim() === "hello") {
      console.log("⚡️ Fast Hello Triggered");
      return res.json({
        reply: "Yo. I'm locked in. Upload a contract or ask me about splits.",
        analysis: "Yo. I'm locked in. Upload a contract or ask me about splits.",
        message: "Yo. I'm locked in. Upload a contract or ask me about splits.",
        response: "Yo. I'm locked in. Upload a contract or ask me about splits."
      });
    }

    // 2. NORMAL PATH: Process File or Text
    if (req.file) {
      console.log("📄 PDF Detected");
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      userPrompt = `Visual Scorecard Protocol:\n${data.text}`;
      fs.unlinkSync(req.file.path);
    } else {
      userPrompt = rawBody || "Hello";
      console.log(`💬 Text Detected: "${userPrompt.substring(0, 15)}..."`);
    }

    // 3. CALL CLAUDE
    console.log(`🤖 Sending to ${MODEL_ID}...`);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 2000,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    });

    const replyText = response.content[0].text;
    console.log("✅ Reply Received from Brain");

    // 4. SEND "SHOTGUN" RESPONSE (Covers all bases)
    // We send the same answer in 4 different keys to satisfy any frontend code.
    res.json({ 
      reply: replyText,      // Standard
      analysis: replyText,   // For Audits
      message: replyText,    // Common
      response: replyText    // Google Standard
    });

  } catch (error) {
    console.error("❌ CRASH:", error);
    res.status(200).json({ // Return 200 OK even on error so frontend shows the message
      reply: `⚠️ ERROR: ${error.message}`,
      analysis: `⚠️ ERROR: ${error.message}`
    });
  }
}

// ✅ ROUTES
app.post('/chat', upload.single('contract'), handleRequest);
app.post('/api/chat', upload.single('contract'), handleRequest);
app.post('/audit', upload.single('contract'), handleRequest);
app.post('/api/audit', upload.single('contract'), handleRequest);

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ ZaHouse Online (Port ${port})`);
});
