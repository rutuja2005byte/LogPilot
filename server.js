
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

  const line = JSON.stringify(event);

  fs.appendFileSync(logFile, line + "\n");
  console.log(line);
}

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    writeLog(req, 200, "INFO", "Request successful");
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("Welcome to LogPilot");
  }

  if (req.url === "/error") {
    writeLog(req, 500, "ERROR", "Simulated internal server error");
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end("Internal Server Error");
  }

  writeLog(req, 404, "WARN", "Route not found");
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Page Not Found");
});

server.listen(3000, "0.0.0.0", () => {
  console.log("LogPilot API running on port 3000");
});
