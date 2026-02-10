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

// 1. Allow the Frontend to talk to the Backend
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 2. Setup File Uploads
const upload = multer({ dest: 'uploads/' });

// 3. Setup Claude
// (Make sure ANTHROPIC_API_KEY is in Railway Variables)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

// 🔥 ZAHOUSE INSTRUCTIONS 🔥
const SYSTEM_PROMPT = `
ROLE: You are the ZaHouse Music Law Strategist.
GOAL: Provide legal strategy and gather user details.
TONE: Authority with Swagger. "Real Talk".
FORMAT: Use Markdown headers (###) and bold key terms.
`;

// ==========================================
// ✅ ROUTE 1: CHAT (Text)
// ==========================================
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.prompt;
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });

    res.json({ reply: response.content[0].text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error" });
  }
});

// ==========================================
// ✅ ROUTE 2: AUDIT (PDF Contracts)
// ==========================================
app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    let contractText = "";
    
    // Read the PDF
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path); // Clean up
    }

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Visual Scorecard Protocol:\n${contractText}` }]
    });

    res.json({ analysis: response.content[0].text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error" });
  }
});

// ==========================================
// ✅ ROUTE 3: THE UI (Frontend)
// ==========================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
