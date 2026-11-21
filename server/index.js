import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`DEADLINE RESCUE API listening on http://localhost:${config.port}`);
  console.log(`  Notion: ${config.notion.token ? 'configured' : 'not configured (demo mode only)'}`);
  console.log(`  AI planner: ${config.ai.apiKey ? `LLM (${config.ai.model})` : 'built-in rule-based engine'}`);
});
