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

// Initialize Claude (The New Brain)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

app.use(cors());
app.use(express.json());

// ✅ RESTORE THE SHELL: This line serves your original frontend (HTML/CSS)
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// If no frontend is found, show this backup message
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      res.send('<h1>🟢 ZaHouse Auditor is Online</h1><p>The Shell is active. Claude is ready.</p>');
    }
  });
});

// THE CLAUDE BRAIN (Connected to your Shell)
app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    let contractText = "";
    
    // 1. Read the file uploaded by the Shell
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      fs.unlinkSync(req.file.path);
    } else {
      return res.status(400).json({ error: "No contract file uploaded." });
    }

    // 2. Process with Claude 3.5 Sonnet
    const prompt = `You are an expert music attorney. Analyze the following contract clause by clause.
    For each red flag, provide:
    1. The exact text.
    2. Why it is dangerous for the artist.
    3. The specific "Artist-Friendly" revision text.
    
    Contract Text:
    ${contractText}`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    });

    // 3. Send the smart answer back to the Shell
    res.json({ analysis: message.content[0].text });

  } catch (error) {
    console.error("Claude Error:", error);
    res.status(500).json({ error: "Audit failed", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor running on port ${port}`);
});
