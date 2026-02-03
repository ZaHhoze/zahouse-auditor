require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');
// PDF Tools
const { jsPDF } = require("jspdf");
require("jspdf-autotable");

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.ZAHOUSE_STRATEGIST;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- 🖼️ LOGO CONFIGURATION ---
// Go to https://www.base64-image.de/, upload your logo, and paste the huge string here.
// Keep the "data:image/png;base64," part.
const COMPANY_LOGO_BASE64 = ""; // <--- PASTE YOUR BASE64 STRING INSIDE THESE QUOTES

// --- 1. SEARCH TOOL (The Eyes) ---
async function searchWeb(query) {
    if (!TAVILY_API_KEY) return null;
    try {
        console.log(`🔎 Searching Tavily for: ${query}`);
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 3
            })
        });
        const data = await response.json();
        return `\n\n=== 🌍 LIVE WEB NEWS ===\n${data.answer}\n(Sources: ${data.results.map(r => r.title).join(', ')})`;
    } catch (err) {
        console.error("Search failed:", err);
        return null;
    }
}

// --- 2. PDF GENERATOR (The Product) ---
async function generateAuditPDF(data) {
    const doc = new jsPDF();
    const gold = [212, 175, 55]; 
    const charcoal = [30, 30, 30]; 

    // Header Bar
    doc.setFillColor(...charcoal);
    doc.rect(0, 0, 210, 45, 'F');
    
    // Logo (Fallback if empty)
    if (COMPANY_LOGO_BASE64.length > 50) {
        try {
            doc.addImage(COMPANY_LOGO_BASE64, 'PNG', 15, 10, 25, 25);
        } catch (e) { console.log("Logo Error", e); }
    } else {
        doc.setFontSize(22);
        doc.setTextColor(...gold);
        doc.text("ZH", 20, 25);
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...gold);
    doc.text("ZaHouse Forensic Alpha Report", 45, 25);
    
    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 45, 32);

    // Scorecard
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 55, 180, 20, 'F');
    doc.setFontSize(16);
    doc.setTextColor(...charcoal);
    doc.text(`DEAL SCORE: ${data.score || "N/A"}/100`, 20, 68);

    // Verdict
    doc.setFontSize(12);
    doc.text("THE ARCHITECT'S VERDICT", 15, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const splitVerdict = doc.splitTextToSize(data.verdict || "No verdict generated.", 180);
    doc.text(splitVerdict, 15, 92);

    // Risk Table
    if (data.riskTable && data.riskTable.length > 0) {
        doc.autoTable({
            startY: 110,
            head: [['IP Pillar', 'Forensic Rating', 'Safety Status']],
            body: data.riskTable,
            theme: 'grid',
            headStyles: { fillColor: gold, textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 5 },
            didDrawPage: (d) => {
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${d.pageNumber} - Audited by ZaHouse`, 150, 285);
            }
        });
    }

    return Buffer.from(doc.output('arraybuffer'));
}

// --- 3. KNOWLEDGE BASE (Permanent Brain) ---
let PERMANENT_BRAIN = "";
async function loadBrain() {
    const brainDir = path.join(__dirname, 'knowledge_base');
    if (!fs.existsSync(brainDir)) { fs.mkdirSync(brainDir); return; }
    
    const files = fs.readdirSync(brainDir);
    for (const file of files) {
        if (file.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(path.join(brainDir, file));
            const data = await pdf(dataBuffer);
            PERMANENT_BRAIN += `\n\n--- SOURCE: ${file} ---\n${data.text.substring(0, 8000)}`;
        }
    }
    console.log("✅ Knowledge Base Loaded!");
}
loadBrain();

// --- 4. UPLOAD & LEAD HANDLING ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
const upload = multer({ dest: 'uploads/' });

const LEADS_FILE = path.join(__dirname, 'leads.json');
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, JSON.stringify([]));

// Serve Dashboard
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// ROUTE: Capture Emails
app.post('/capture-lead', (req, res) => {
    const { email } = req.body;
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE));
    if (!leads.find(l => l.email === email)) {
        leads.push({ email, date: new Date().toISOString() });
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads));
    }
    res.json({ success: true });
});

// ROUTE: Download PDF (The New Part)
app.post('/download-audit', async (req, res) => {
    const { score, verdict, riskTable } = req.body; // Front-end sends this data
    try {
        const pdfBuffer = await generateAuditPDF({ score, verdict, riskTable });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=ZaHouse_Audit_Report.pdf');
        res.send(pdfBuffer);
    } catch (err) {
        console.error("PDF Error:", err);
        res.status(500).json({ error: "Could not generate report" });
    }
});

// ROUTE: The Logic Engine
app.post('/audit', upload.single('file'), async (req, res) => {
    let { message, email, threadId } = req.body;
    let contractText = "";
    let systemPrompt = "";
    let searchContext = "";

    try {
        // LEAD GATE: Must have email for file uploads
        if (req.file && !email) {
            if (req.file) fs.unlinkSync(req.file.path); // Clean up
            return res.json({ 
                response: "🔒 **AUDIT LOCKED:** Forensic Alpha reports are reserved for Protocol Members. Please enter your email to unlock.",
                requiresEmail: true 
            });
        }

        // MODE A: AUDIT
        if (req.file) {
            const dataBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdf(dataBuffer);
            contractText = `\n\n=== CONTRACT TO AUDIT ===\n${pdfData.text.substring(0, 15000)}`; 
            fs.unlinkSync(req.file.path);

            systemPrompt = `
            ROLE: ZaHouse Forensic IP Architect.
            YOUR KNOWLEDGE: ${PERMANENT_BRAIN.substring(0, 10000)}
            TASK: Generate a Deal Scorecard (0-100), Verdict, Risk Table.
            
            IMPORTANT: Your output must be valid JSON-like structure inside the text so we can parse it for the PDF later.
            Format the visual output nicely for the chat, but ensure you include:
            # 🚨 DEAL SCORE: [Number]/100
            ## ⚖️ THE VERDICT
            ...
            ## 📊 RISK ANALYSIS CHART
            | Category | Rating | Status |
            ...
            `;
            
        } else {
            // MODE B: CHAT
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("news") || lowerMsg.includes("suno") || lowerMsg.includes("update")) {
                const webResult = await searchWeb(message);
                if (webResult) searchContext = webResult;
            }

            systemPrompt = `
            ROLE: ZaHouse Music Law Strategist.
            YOUR KNOWLEDGE: ${PERMANENT_BRAIN.substring(0, 10000)}
            INSTRUCTION: Use 'LIVE WEB NEWS' if present.
            `;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: (message || "Hello") + contractText + searchContext }
            ],
            model: "llama-3.3-70b-versatile",
            max_completion_tokens: 1500, 
            temperature: 0.6,
        });

        res.json({ 
            response: chatCompletion.choices[0]?.message?.content, 
            threadId: threadId 
        });

    } catch (err) {
        console.error("Groq Error:", err);
        res.status(400).json({ response: "**System Error:** " + err.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`ZaHouse V5 (Full Revenue Engine) on Port ${PORT}`));
