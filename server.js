const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const logDir = process.env.LOG_DIR || path.join(__dirname, "logs");
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "app.json");
const dashboardFile = path.join(__dirname, "public", "index.html");

function writeLog(req, statusCode, level, message) {
  const event = {
    "@timestamp": new Date().toISOString(),
    service: "logpilot-api",
    level,
    message,
    method: req.method,
    url: req.url,
    statusCode,
  };

  fs.appendFileSync(logFile, JSON.stringify(event) + "\n");
  console.log(JSON.stringify(event));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (body.length > 10000) {
      throw new Error("Request body too large");
    }
  }

  return body;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });

  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    try {
      const html = fs.readFileSync(dashboardFile, "utf8");
      writeLog(req, 200, "INFO", "Dashboard opened");

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
      });

      return res.end(html);
    } catch (error) {
      console.error("Dashboard error:", error.message);
      return sendJson(res, 500, {
        error: "Could not load public/index.html",
      });
    }
  }

  if (req.method === "GET" && req.url === "/error") {
    writeLog(req, 500, "ERROR", "Simulated internal server error");

    return sendJson(res, 500, {
      error: "Internal Server Error",
    });
  }

  if (req.method === "POST" && req.url === "/ai") {
    try {
      const body = await readBody(req);
      const { question } = JSON.parse(body);

      if (typeof question !== "string" || !question.trim()) {
        return sendJson(res, 400, {
          error: "Please provide a question",
        });
      }

      const ollamaResponse = await fetch(
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
                  "You are LogPilot AI, a DevOps assistant. Explain errors clearly, identify possible causes, and suggest practical debugging steps. Do not claim certainty without evidence.",
              },
              { role: "user", content: question },
            ],
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama returned HTTP ${ollamaResponse.status}`);
      }

      const result = await ollamaResponse.json();
      const answer = result.message?.content || "No answer returned";

      writeLog(req, 200, "INFO", "AI question answered");
      return sendJson(res, 200, { answer });
    } catch (error) {
      writeLog(req, 502, "ERROR", "AI request failed");
      return sendJson(res, 502, {
        error: "Could not get a response from Ollama",
        details: error.message,
      });
    }
  }

  // Live dashboard statistics
  if (req.method === "GET" && req.url === "/api/stats") {
    try {
      const response = await fetch(
        "http://elasticsearch:9200/logpilot-*/_search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            size: 0,
            aggs: {
              status_codes: {
                terms: {
                  field: "statusCode",
                  size: 10
                }
              },
              error_events: {
                filter: {
                  term: { "level.keyword": "ERROR" }
                }
              }
            }
          }),
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(`Elasticsearch returned HTTP ${response.status}`);
      }

      const result = await response.json();
      const buckets = result.aggregations?.status_codes?.buckets || [];

      const statusCodes = {};
      for (const bucket of buckets) {
        statusCodes[bucket.key] = bucket.doc_count;
      }

      return sendJson(res, 200, {
        totalEvents: result.hits?.total?.value ?? 0,
        errorEvents: result.aggregations?.error_events?.doc_count ?? 0,
        statusCodes
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Could not fetch dashboard statistics",
        details: error.message
      });
    }
  }

  // Get recent errors without calling Ollama
  if (req.method === "GET" && req.url === "/api/errors") {
    try {
      const response = await fetch(
        "http://elasticsearch:9200/logpilot-*/_search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            size: 20,
            query: {
              bool: {
                filter: [
                  { term: { "level.keyword": "ERROR" } }
                ]
              }
            },
            sort: [{ "@timestamp": "desc" }]
          }),
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(
          `Elasticsearch returned HTTP ${response.status}`
        );
      }

      const result = await response.json();
      const errors = (result.hits?.hits || []).map(
        hit => hit._source
      );

      return sendJson(res, 200, {
        count: errors.length,
        errors
      });
    } catch (error) {
      console.error("Live logs error:", error.message);

      return sendJson(res, 500, {
        error: "Could not fetch recent errors",
        details: error.message
      });
    }
  }
  if (req.method === "POST" && req.url === "/ai/analyze") {
    try {
      const response = await fetch(
        "http://elasticsearch:9200/logpilot-*/_search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            size: 20,
            query: {
              bool: {
                filter: [{ term: { "level.keyword": "ERROR" } }],
              },
            },
            sort: [{ "@timestamp": "desc" }],
          }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        throw new Error(`Elasticsearch returned HTTP ${response.status}`);
      }

      const result = await response.json();

      const errors = (result.hits?.hits || []).map((hit) => hit._source);
      const question = errors.length
        ? "Analyze these LogPilot error logs. Summarize the evidence, possible causes, and practical debugging steps. Do not invent causes.\n\n" +
          JSON.stringify(errors)
        : "No ERROR events were found in Elasticsearch. Explain what this means and suggest how to generate a test error.";

      const aiResponse = await fetch(
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
                content: `You are LogPilot AI, a professional DevOps log analyzer.

Write clean, concise, structured analysis in plain text.

Follow this exact format:

SUMMARY
Briefly explain the observed errors using evidence from the logs.

POSSIBLE CAUSES
List only causes supported by the available evidence. Clearly label uncertain explanations as possibilities.

DEBUGGING STEPS
Provide 3 to 5 specific, practical steps in priority order.

CONCLUSION
State the main finding in 1 or 2 sentences.

Rules:
- Do not use Markdown bold, italics, headings with #, or decorative symbols.
- Do not use ** or other unnecessary formatting.
- Use simple numbered lists for debugging steps.
- Do not repeat the same information.
- Never invent causes, configuration changes, or infrastructure problems.
- Clearly distinguish observed facts from possible explanations.
- If /error intentionally generates a 500 response for testing, state that it may be an expected simulated error rather than a real production failure.
- Keep the response concise and professional.`,
              },
              { role: "user", content: question },
            ],
          }),
          signal: AbortSignal.timeout(120000),
        },
      );

      if (!aiResponse.ok) {
        throw new Error(`Ollama returned HTTP ${aiResponse.status}`);
      }

      const aiResult = await aiResponse.json();

      writeLog(req, 200, "INFO", "Elasticsearch errors analyzed by AI");

      return sendJson(res, 200, {
        count: errors.length,
        errors,
        analysis: aiResult.message?.content || "No AI analysis returned.",
      });
    } catch (error) {
      console.error("Analysis error:", error.message);
      writeLog(req, 502, "ERROR", "Error analysis failed");

      return sendJson(res, 502, {
        error: "Could not analyze logs",
        details: error.message,
      });
    }
  }

  writeLog(req, 404, "WARN", "Route not found");
  return sendJson(res, 404, { error: "Route not found" });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("LogPilot server running on port 3000");
});
