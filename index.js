require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

// Helper: Mock Forensic Database Search
async function performForensicSearch(artistName) {
    console.log(`Searching registries for: ${artistName}...`);
    // In production, replace this with calls to MusicBrainz or your own DB
    return [
        { title: "Song A", isrc: "US-XXX-24-00001", iswc: "T-123.456.789-0", status: "Linked" },
        { title: "Song B", isrc: "MISSING", iswc: "T-987.654.321-1", status: "Broken Handshake" }
    ];
}

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // 1. Get or Create a Thread
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();

        // 2. Add the User Message
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: message
        });

        // 3. Start the Run
        let run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: ASSISTANT_ID
        });

        // 4. Polling Loop to handle Tool Calls (Forensic protocol)
        while (run.status !== 'completed') {
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === "perform_forensic_catalog_search") {
                        const args = JSON.parse(toolCall.function.arguments);
                        const forensicData = await performForensicSearch(args.artistName);

                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: JSON.stringify(forensicData)
                        });
                    }
                }

                // Submit findings back to the AI
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
                    tool_outputs: toolOutputs
                });
            } else if (run.status === 'failed') {
                throw new Error("Assistant Run Failed");
            }

            // Wait 1 second before checking status again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 5. Get the Final Response
        const messages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0].content[0].text.value;

        res.json({
            response: lastMessage,
            threadId: thread.id
        });

    } catch (error) {
        console.error("Audit Error:", error);
        res.status(500).json({ error: "Forensic connection failed." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Auditor Server active on port ${PORT}`));
