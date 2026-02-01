const express = require('express'); 
const OpenAI = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();


// 1. Setup CORS (The "Security Guard")
const corsOptions = {
  // Use the FRONTEND domains where users click the button
  origin: [
    'https://zahouse.org', 
    'https://www.zahouse.org',
    'http://zahouse.org',
    'http://www.zahouse.org'
  ], 
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Essential for pre-flight browser checks

// 2. Setup JSON Parsing (The "Translator")
app.use(express.json());

// 3. OpenAI Client
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
    if (run.status === 'requires_action') {
        const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
            if (toolCall.function.name === "perform_forensic_catalog_search") {
    const args = JSON.parse(toolCall.function.arguments);
    const artistName = args.artist_name;

    try {
        // STEP 1: Find the Artist's MusicBrainz ID (MBID)
        const artistSearch = await fetch(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`, {
            headers: { 'User-Agent': 'ZaHouseAuditor/1.0.0 (dcrutchfield@za.house)' } // Required by MB
        });
        const artistData = await artistSearch.json();
        const mbid = artistData.artists[0]?.id;

        if (!mbid) throw new Error("Artist not found");

        // STEP 2: Fetch all recordings (songs) for that MBID
        // We include 'isrcs' to get the unique recording identifiers
        const recordingSearch = await fetch(`https://musicbrainz.org/ws/2/recording?artist=${mbid}&limit=100&fmt=json&inc=isrcs`, {
            headers: { 'User-Agent': 'ZaHouseAuditor/1.0.0' }
        });
        const recordingData = await recordingSearch.json();

        // Format the data so OpenAI can read it easily
        const realSongs = recordingData.recordings.map(rec => ({
            title: rec.title,
            isrc: rec.isrcs?.[0] || "Not Found",
            first_release: rec['first-release-date'] || "Unknown"
        }));

        toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify(realSongs)
        });

    } catch (error) {
        toolOutputs.push({
            tool_call_id: toolCall.id,
            output: `No official record found for ${artistName} in MusicBrainz.`
        });
    }
}

        // Submit the results back to OpenAI to resume the run
        run = await openai.beta.threads.runs.submitToolOutputs(
    run.id, // Run ID first
    { 
        thread_id: thread.id, 
        tool_outputs: toolOutputs} 
);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
app.listen(PORT, () => {
    console.log(`Forensic Server live on port ${PORT}`);    run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Forensic Server live on port ${PORT}`);
});
