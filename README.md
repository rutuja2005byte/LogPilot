# LogPilot 

A Docker-based log monitoring and AI-powered incident analysis platform built using Node.js, the ELK Stack, and Ollama.

## Overview

LogPilot collects application logs, indexes them in Elasticsearch, visualizes them through Kibana, and uses a local LLM to analyze errors and suggest debugging steps.

## Features

- **Log Collection:** Captures application requests, errors, and HTTP status codes.
- **Centralized Logging:** Uses Logstash to process and forward logs to Elasticsearch.
- **Live Dashboard:** Displays error statistics and recent logs with automatic refresh.
- **AI Incident Analysis:** Uses Ollama and Llama 3.2 to analyze recent errors locally.
- **Log Visualization:** Explore logs and create visualizations in Kibana.
- **Containerized Setup:** Runs services using Docker Compose.
- **Nginx Integration:** Collects and analyzes Nginx access logs.

## Tech Stack

- Node.js
- Elasticsearch
- Logstash
- Kibana
- Docker & Docker Compose
- Ollama — Llama 3.2
- HTML, CSS, JavaScript
- Nginx

## Architecture

Application → JSON Logs → Logstash → Elasticsearch → Kibana Dashboard

Elasticsearch Logs → Ollama → AI Incident Analysis

## Getting Started

### Prerequisites

- Docker Desktop
- Node.js
- Ollama installed locally
- Llama 3.2 model downloaded

### Run the Project

Clone the repository:

```bash
git clone https://github.com/rutuja2005byte/logpilot.git
cd logpilot
```

Start the services:

```bash
docker compose up -d --build
```

Pull the AI model if it is not already installed:

```bash
ollama pull llama3.2
```

Open the application:

- **Dashboard:** http://localhost:3000
- **Kibana:** http://localhost:5601
- **Elasticsearch:** http://localhost:9200

## Testing

Generate a sample server error:

```bash
curl -i http://localhost:3000/error
```

Check the application statistics:

```bash
curl http://localhost:3000/api/stats
```

View recent errors:

```bash
curl http://localhost:3000/api/errors
```

## Stop the Project

```bash
docker compose down
```

To remove containers and stored Docker volumes:

```bash
docker compose down -v
```

**Warning:** The second command deletes persisted data stored in the Compose volumes.

## Future Improvements

- Advanced monitoring and alerting
- Improved incident classification
- Additional log sources and visualizations

## Author

GitHub: [rutuja2005byte](https://github.com/rutuja2005byte)
