// ... (keep your top imports)

app.post('/audit', async (req, res) => {
    const { message, threadId } = req.body;

    try {
        // FORCE ID CHECK: If it's missing, we start fresh to avoid the /undefined/ crash
        let thread;
        if (threadId && threadId.startsWith('thread_')) {
            thread = { id: threadId };
        } else {
            thread = await openai.beta.threads.create();
        }

        console.log("Current Thread ID:", thread.id); // This will show in Railway logs

        await openai.beta.threads.messages.create(thread.id, { role: "user", content: message });

        // Create the run
        let run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });

        // POLLING LOOP
        let attempts = 0;
        while (run.status !== 'completed' && attempts < 30) {
            
            // SYNTAX FIX: This format is the most stable for Node SDK v4
            run = await openai.beta.threads.runs.retrieve(thread.id, run.id);

            if (run.status === 'requires_action') {
                const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = toolCalls.map(tc => ({
                    tool_call_id: tc.id,
                    output: JSON.stringify([{ title: "Asset 01", iswc: "T-010.556.789-0", status: "ISWC SECURE" }])
                }));
                
                run = await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });
            }
            
            if (run.status === 'failed') throw new Error("Assistant Brain Failed");

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }

        const messages = await openai.beta.threads.messages.list(thread.id);
        res.json({ response: messages.data[0].content[0].text.value, threadId: thread.id });

    } catch (err) {
        console.error("CRITICAL CRASH:", err.message);
        res.status(500).json({ error: "System Reset Required", details: err.message });
    }
});
