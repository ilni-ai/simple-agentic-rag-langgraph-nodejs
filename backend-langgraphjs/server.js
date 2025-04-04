// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { graph } from "./basicGraph.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Standard question query: retrieve → generate → suggest
app.post("/api/query", async (req, res) => {
  const { question, sessionId } = req.body;
  console.log("📨 Received query:", question);

  try {
    const result = await graph.invoke({ question, sessionId });
    console.log("✅ Graph result:", result);
    res.json(result);
  } catch (err) {
    console.error("❌ Graph failed:", err.stack);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Separate summarize route: ONLY summarize past history
app.post("/api/summarize", async (req, res) => {
  const { sessionId } = req.body;
  console.log("📨 Summarizing for session:", sessionId);

  try {
    // Minimal input; only sessionId is needed
    const result = await graph.invoke({ question: "", sessionId });
    console.log("✅ Summary result:", result.summary);
    res.json({ summary: result.summary });
  } catch (err) {
    console.error("❌ Summary failed:", err.stack);
    res.status(500).json({ error: "Failed to summarize." });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server ready at http://localhost:${port}`);
});
