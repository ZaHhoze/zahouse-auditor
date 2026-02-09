krequire('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude (The Legal Genius)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/audit', upload.single('contract'), async (req, res) => {
  try {
    let contractText = "";

    // 1. Extract Text from PDF
    if (req.file) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      contractText = data.text;
      // Cleanup file after reading
      fs.unlinkSync(req.file.path);
    } else {
      return res.status(400).json({ error: "No contract file uploaded." });
    }

    // 2. The Legal Prompt
    const prompt = `You are an expert music attorney. Analyze the following contract clause by clause.
    For each red flag, provide:
    1. The exact text.
    2. Why it is dangerous for the artist.
    3. The specific "Artist-Friendly" revision text.
    
    Contract Text:
    ${contractText}`;

    // 3. Send to Claude 3.5 Sonnet
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const analysis = message.content[0].text;
    res.json({ analysis: analysis });

  } catch (error) {
    console.error("Claude Error:", error);
    res.status(500).json({ error: "Audit failed", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`ZaHouse Auditor (Claude Edition) running on port ${port}`);
});
