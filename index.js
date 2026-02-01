const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. Setup CORS (Updated for Express 5 stability)
const corsOptions = {
    origin: ['https://zahouse.org', 'https://www.zahouse.org'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

app.use(cors(corsOptions));

// This is the fix for the PathError - using a regex-friendly path
app.options(/(.*)/, cors(corsOptions)); 

// 2. Middleware
app.use(express.json());

// 3. OpenAI Client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 4. The Audit Route
app.post('/audit', async (req, res) => {
    try {
        const { message, threadId } = req.body;
        const thread = threadId ? { id: threadId } : await openai.beta.threads.create();

        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: message
        });

        let run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.ASSISTANT_ID
        });

        // Loop until AI provides the forensic table
        while (['queued', 'in_progress', 'requires_action'].includes(run.status)) {
            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];

                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === "perform_forensic_catalog_search") {
                        const args = JSON.parse(toolCall.function.arguments);
                        const artistName = args.artist_name;

                        try {
                            const artistSearch = await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`, {
                                headers: { 'User-Agent': 'ZaHouseAuditor/1.0.0 (dcrutchfield@za.house)' }
                            });
                            const artistData = await artistSearch.json();
                            const mbid = artistData.artists[0]?.id;

                            if (!mbid) throw new Error("Artist not found");

                            const recordingSearch = await fetch(`https://musicbrainz.org/ws/2/recording?artist=${mbid}&limit=100&fmt=json&inc=isrcs`, {
                                headers: { 'User-Agent': 'ZaHouseAuditor/1.0.0' }
                            });
                            const recordingData = await recordingSearch.json();

                            const realSongs = recordingData.recordings.map(rec => ({
                                title: rec.title,
                                isrc: rec.isrcs?.[0] || "Not Found",
                                first_release: rec['first-release-date'] || "Unknown"
                            }));

                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: JSON.stringify(realSongs)
                            });
                        } catch (err) {
                            toolOutputs.push({
                                tool_call_id: toolCall.id,
                                output: "No records found in MusicBrainz."
                            });
                        }
                    }
                }
                run = await openai.beta.threads.runs.submitToolOutputs(run.id, {
                    thread_id: thread.id,
                    tool_outputs: toolOutputs
                });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
        }

        const messages = await openai.beta.threads.messages.list(thread.id);
        res.json({
            response: messages.data[0].content[0].text.value,
            threadId: thread.id
        });

    } catch (error) {
        console.error("Audit Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 5. Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Forensic Server live on port ${PORT}`);
});
