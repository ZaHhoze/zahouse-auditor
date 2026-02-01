const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // Allows zahouse.org to talk to this server
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;
   
    // Manage conversation threads to remember artist context
    const thread = threadId ? { id: threadId } : await openai.beta.threads.create();

    // Send the user's name/IPI to the Assistant
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: message
    });

    // Start the forensic run
    let run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: process.env.ASSISTANT_ID
    });

    // Wait for the AI to 'spit out' the final table results
    while (['queued', 'in_progress', 'requires_action'].includes(run.status)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        run = await openai.beta.threads.runs.retrieve(run.id, {thread_id: thread.id});
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    res.json({
        response: messages.data[0].content[0].text.value,
        threadId: thread.id
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Forensic Server live on port ${PORT}`));
