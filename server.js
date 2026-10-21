
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const logDir = process.env.LOG_DIR || path.join(__dirname, "logs");
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "app.json");

const ES_URL = "http://elasticsearch:9200";
const OLLAMA_URL = "http://host.docker.internal:11434/api/chat";
const MODEL = "llama3.2:latest";

function writeLog(req, statusCode, level, message) {
  const event = {
    "@timestamp": new Date().toISOString(),
    service: "logpilot-api",
    level,
    message,
    method: req.method,
    url: req.url,
    statusCode
  };

  fs.appendFileSync(logFile, JSON.stringify(event) + "\n");
  console.log(JSON.stringify(event));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (body.length > 10000) {
      throw new Error("Request too large");
    }
  }

  return JSON.parse(body);
}

async function askOllama(question) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are LogPilot AI, a DevOps assistant. Analyze only the supplied evidence. Explain errors, likely causes, and practical debugging steps. Clearly distinguish facts from hypotheses."
        },
        { role: "user", content: question }
      ]
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.message?.content || "No answer returned";
}

async function getRecentErrors() {
  const response = await fetch(`${ES_URL}/logpilot-*/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: 20,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          should: [
            { term: { level: "ERROR" } },
            { range: { statusCode: { gte: 500 } } }
          ],
          minimum_should_match: 1
        }
      },
      _source: [
        "@timestamp",
        "service",
        "level",
        "message",
        "method",
        "url",
        "statusCode"
      ]
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch returned HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.hits.hits.map(hit => hit._source);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method === "GET" && req.url === "/") {
      writeLog(req, 200, "INFO", "Request successful");
      res.writeHead(200);
      return res.end(JSON.stringify({ message: "Welcome to LogPilot" }));
    }

    if (req.method === "GET" && req.url === "/error") {
      writeLog(req, 500, "ERROR", "Simulated internal server error");
      res.writeHead(500);
      return res.end(JSON.stringify({ error: "Internal Server Error" }));
    }

    if (req.method === "POST" && req.url === "/ai") {
      const { question } = await readBody(req);

      if (typeof question !== "string" || !question.trim()) {
        res.writeHead(400);
        return res.end(JSON.stringify({
          error: "Please provide a question"
        }));
      }

      const answer = await askOllama(question);
      writeLog(req, 200, "INFO", "AI question answered");
      res.writeHead(200);
      return res.end(JSON.stringify({ answer }));
    }

    if (req.method === "POST" && req.url === "/ai/analyze") {
      const errors = await getRecentErrors();

      if (errors.length === 0) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          message: "No recent errors found in Elasticsearch.",
          errors: [],
          analysis: "There are no matching errors to analyze."
        }));
      }

      const analysis = await askOllama(
        "Analyze these recent LogPilot error events from Elasticsearch. " +
        "Summarize the observed errors, list likely causes supported by the evidence, " +
        "and recommend practical next debugging steps. Do not invent root causes.\n\n" +
        JSON.stringify(errors, null, 2)
      );

      writeLog(req, 200, "INFO", "Elasticsearch errors analyzed by AI");
      res.writeHead(200);
      return res.end(JSON.stringify({
        count: errors.length,
        errors,
        analysis
      }));
    }

    writeLog(req, 404, "WARN", "Route not found");
    res.writeHead(404);
    return res.end(JSON.stringify({ error: "Route not found" }));

  } catch (error) {
    const tooLarge = error.message === "Request too large";
    console.error("Request error:", error.message);

    writeLog(req, tooLarge ? 413 : 502, "ERROR", "Request processing failed");
    res.writeHead(tooLarge ? 413 : 502);
    return res.end(JSON.stringify({
      error: tooLarge ? error.message : "Request processing failed",
      details: error.message
    }));
  }
});

server.listen(3000, "0.0.0.0", () => {
  console.log("LogPilot API running on port 3000");
});
