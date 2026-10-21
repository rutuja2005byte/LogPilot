
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const logDir = process.env.LOG_DIR || path.join(__dirname, "logs");
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "app.json");

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

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

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
    let body = "";

    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 10000) {
          res.writeHead(413);
          return res.end(JSON.stringify({ error: "Request too large" }));
        }
      }

      const { question } = JSON.parse(body);

      if (typeof question !== "string" || !question.trim()) {
        res.writeHead(400);
        return res.end(JSON.stringify({
          error: "Please provide a question"
        }));
      }

      const response = await fetch(
        "http://host.docker.internal:11434/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3.2:latest",
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "You are LogPilot AI, a helpful DevOps assistant. Explain server logs and errors clearly, identify likely causes, and suggest practical debugging steps. Do not claim certainty without evidence."
              },
              { role: "user", content: question }
            ]
          }),
          signal: AbortSignal.timeout(120000)
        }
      );

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}`);
      }

      const result = await response.json();
      const answer = result.message?.content || "No answer returned";

      writeLog(req, 200, "INFO", "AI question answered");
      res.writeHead(200);
      return res.end(JSON.stringify({ answer }));

    } catch (error) {
      console.error("AI endpoint error:", error.message);
      writeLog(req, 502, "ERROR", "AI request failed");
      res.writeHead(502);
      return res.end(JSON.stringify({
        error: "Could not get a response from Ollama",
        details: error.message
      }));
    }
  }

  writeLog(req, 404, "WARN", "Route not found");
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Route not found" }));
});

server.listen(3000, "0.0.0.0", () => {
  console.log("LogPilot API running on port 3000");
});
