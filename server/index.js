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
  // Vite fingerprints asset file names, so they can be cached forever.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`DEADLINE RESCUE API listening on http://localhost:${config.port}`);
  console.log(`  Mode: ${config.mode}${config.publicMode ? ' (visitors keep their own data in their browser)' : ''}`);
  if (config.publicMode) {
    console.log('  Notion: disabled in public mode');
    if (config.ignoredNotionToken) console.warn('  NOTION_TOKEN is set but ignored because APP_MODE is public.');
  } else {
    console.log(`  Notion: ${config.notion.token ? 'configured' : 'not configured (demo mode only)'}`);
    if (config.isProduction && config.notion.token) {
      console.warn('  WARNING: personal mode exposes your Notion workspace to anyone who can reach this server. Use APP_MODE=public for public deployments.');
    }
  }
  console.log(`  AI planner: ${config.ai.apiKey ? `LLM (${config.ai.model})` : 'built-in rule-based engine'}`);
});
