import dotenv from "dotenv";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { z } from "zod";
import { StateGraph, START, END } from "@langchain/langgraph";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

dotenv.config();
console.log("Gemini API Key loaded ✅");

// 🔹 SQLite setup
const db = await open({
  filename: "./chat_memory.db",
  driver: sqlite3.Database,
});
await db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    sessionId TEXT,
    question TEXT,
    answer TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function getChatHistory(sessionId) {
  return await db.all(
    `SELECT question, answer FROM memory WHERE sessionId = ? ORDER BY timestamp ASC`,
    sessionId
  );
}

async function saveToMemory(sessionId, question, answer) {
  await db.run(
    `INSERT INTO memory (sessionId, question, answer) VALUES (?, ?, ?);`,
    sessionId,
    question,
    answer
  );
}

// 🔹 LangGraph state definition (includes summary field)
const stateSchema = z.object({
  question: z.string(),
  sessionId: z.string(),
  context: z.string().optional(),
  answer: z.string().optional(),
  followUp: z.string().optional(),
  summary: z.string().optional(),
});

// 🔹 Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const embedModel = genAI.getGenerativeModel({ model: "embedding-001" });

let geminiCallCount = 0;
async function invokeGemini(prompt, nodeName = "unknown") {
  geminiCallCount++;
  const preview = prompt.slice(0, 100).replace(/\n/g, " ").trim();
  console.log(`🧠 Gemini call #${geminiCallCount} [${nodeName}]: "${preview}..."`);

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error(`❌ Gemini error in [${nodeName}]: ${err.message}`);
    throw err;
  }
}

async function generateEmbedding(text) {
  const res = await embedModel.embedContent({
    content: { parts: [{ text }] },
  });
  return res.embedding.values;
}

// 🔹 FAISS vector store setup
const docPath = path.resolve("./data/docs.txt");
let vectorStore;

async function loadVectorStore() {
  try {
    vectorStore = await FaissStore.load("./vector-index", {
      async embedQuery(text) {
        return await generateEmbedding(text);
      },
    });
    console.log("✅ Loaded FAISS vector store from disk.");
  } catch (e) {
    console.log("⚠️ No saved FAISS index found. Creating new one...");
    const loader = new TextLoader(docPath);
    const rawDocs = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const documents = await splitter.splitDocuments(rawDocs);

    vectorStore = await FaissStore.fromDocuments(documents, {
      async embedDocuments(texts) {
        return await Promise.all(texts.map(generateEmbedding));
      },
    });

    await vectorStore.save("./vector-index");
    console.log(`✅ Embedded ${documents.length} chunks and saved FAISS index.`);
  }
}
await loadVectorStore();

// 🔹 Node: retrieve
async function retrieve(state) {
  const context = await retrieveRelevantContext(state.question);
  return { context };
}

// 🔹 Node: generate
async function generate(state) {
  const { question, sessionId, context } = state;
  const history = await getChatHistory(sessionId);
  const historyText = history.map(h => `User: ${h.question}\nBot: ${h.answer}`).join("\n");

  const prompt = `
You are a helpful assistant.

Context:
${context}

Conversation so far:
${historyText}

Current question:
${question}

Answer clearly:
  `;

  const answer = await invokeGemini(prompt, "generate");
  await saveToMemory(sessionId, question, answer);
  return { answer };
}

// 🔹 Node: suggest
async function suggest(state) {
  const { question, answer } = state;

  const followUpPrompt = `
Based on the answer below, suggest 2 follow-up questions.

Question: ${question}
Answer: ${answer}

Only return the questions, separated by new lines.
  `;
  const followUp = await invokeGemini(followUpPrompt, "suggest");
  return { followUp };
}

// 🔹 Node: summarize
async function summarize(state) {
  const history = await getChatHistory(state.sessionId);
  const historyText = history.map(h => `User: ${h.question}\nBot: ${h.answer}`).join("\n");

  const summaryPrompt = `
Summarize this conversation:

${historyText}

Give a brief overview in a few sentences.
  `;
  const summary = await invokeGemini(summaryPrompt, "summarize");
  return { summary };
}

// 🔹 Retrieval helper
async function retrieveRelevantContext(query, topK = 3) {
  const results = await vectorStore.similaritySearch(query, topK);
  return results.map(doc => doc.pageContent).join("\n");
}

// 🔹 Graph construction
const builder = new StateGraph(stateSchema)
  .addNode("retrieve", retrieve)
  .addNode("generate", generate)
  .addNode("suggest", suggest)
  .addNode("summarize", summarize)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", "suggest")
  .addEdge("suggest", "summarize")
  .addEdge("summarize", END);

export const graph = builder.compile();
