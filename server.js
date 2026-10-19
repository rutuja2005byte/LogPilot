const http = require("http");

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Welcome to LogPilot");
  } else if (req.url === "/error") {
    console.error("500 Internal Server Error: Something went wrong");

    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  } else {
    console.error(`404 Not Found: ${req.url}`);

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Page Not Found");
  }
});

server.listen(3000, () => {
  console.log("LogPilot running at http://localhost:3000");
});
