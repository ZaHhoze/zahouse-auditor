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

// 🧠 LOCKED MODEL (From your Screenshot)
const MODEL_ID = "claude-sonnet-4-20250514";

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 🔍 TRAFFIC LOGGER (Helps us see what's happening)
app.use((req, res, next) => {
  console.log(`[TRAFFIC] ${req.method} request to: ${req.path}`);
  next();
});

const upload = multer({ dest: 'uploads/' });

// 🔥 ZAHOUSE STRATEGIST INSTRUCTIONS 🔥
const ZAHOUSE_SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist. You are an industry insider, a protector of creative equity, and a deal-maker.
GOAL: Provide high-value, specific legal and strategic guidance while naturally gathering user details.
THE SOFT SELL: Answer the legal question first. Then pivot: "That clause looks standard, but I want to see who I'm advising. What's your artist name or IG?"
TONE: Authority with Swagger. "Real Talk". Use metaphors.
VISUALS: Use ### Headers and **Bold** for key money terms.
`;

// ✅ THE "SMART" HANDLER
// This function handles BOTH Chat and Audits intelligently.
async function handleRequest(req, res) {
  // 1. Check API Key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ API Key Missing");
    return res.json({ reply: "⚠️ SYSTEM ALERT: API Key is missing in Railway Variables." });
  }

  try {
    let userPrompt = "";
    let isAudit = false;

    // 2. DETECT MODE: Is there a file?
    if (req.file) {
      console.log("📄 PDF Detected (Audit Mode)");
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      userPrompt = `Visual Scorecard Protocol:\n${data.text}`;
      isAudit = true;
      // Clean up file
      fs.unlinkSync(req.file.path);
    } 
    // 3. NO FILE? Then it's just Chat (even if they hit /audit)
    else {
      userPrompt = req.body.message || req.body.prompt;
      
      if (!userPrompt) {
        // If the user hit /audit with no file AND no text, assume they want a greeting
        userPrompt = "Hello"; 
      }
      console.log(`💬 Text Detected: "${userPrompt.substring(0, 20)}..."`);
    }

    // 4. CALL CLAUDE
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    console.log(`🤖 Sending to Model: ${MODEL_ID}`);
    const response = await anthropic.messages.create({
      model: MODEL_ID, // claude-sonnet-4-20250514
      max_tokens: 2000,
      system: ZAHOUSE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    });

    const replyText = response.content[0].text;
    console.log("✅ Reply Received");

    // 5. SEND RESPONSE (Dual Format to satisfy any frontend)
    res.json({ 
      reply: replyText, 
      analysis: replyText 
    });

  } catch (error) {
    console.error("❌ CRASH:", error);
    res.json({ 
      reply: `⚠️ BRAIN ERROR: ${error.message}`,
      analysis: `⚠️ BRAIN ERROR: ${error.message}`
    });
  }
}

// ✅ ROUTES (Open All Doors)
// We route EVERYTHING to the smart handler.
// We add 'upload.single' to all routes so it catches files if they exist, but ignores them if they don't.
app.post('/chat', upload.single('contract'), handleRequest);
app.post('/api/chat', upload.single('contract'), handleRequest);
app.post('/audit', upload.single('contract'), handleRequest);
app.post('/api/audit', upload.single('contract'), handleRequest);

// Fallback for UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`✅ ZaHouse Online (Port ${port})`);
  console.log(`🧠 Model Locked: ${MODEL_ID}`);
});
