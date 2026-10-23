// Fault injection: a local copy of the API where three rows are tampered with.
// Expected: those three FAIL, the rest PASS, exit code 1.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = 'https://api.basedagents.ai';
const get = async (p) => (await fetch(API + p)).json();
const x402 = await get('/.well-known/x402');
const feed = await get('/v1/tasks/settled?limit=50');
const rows = feed.tasks;
rows[0].bounty.amount_display = '2.00';                     // wrong amount
rows[1].agent.id = rows[3].agent.id;                        // wallet of another agent
rows[2].tx_hash = '0x' + '00'.repeat(32);                   // no such transaction

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body;
  if (u.pathname === '/.well-known/x402') body = x402;
  else if (u.pathname === '/v1/tasks/settled') body = { ok: true, tasks: rows, next_cursor: null };
  else if (u.pathname.startsWith('/v1/agents/')) body = await get(u.pathname);
  else { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
srv.listen(0, '127.0.0.1', () => {
  const port = srv.address().port;
  const child = spawn(process.execPath, [fileURLToPath(new URL('./verify-settled.mjs', import.meta.url)), '--api', `http://127.0.0.1:${port}`], { stdio: 'inherit' });
  child.on('exit', (code) => { console.log(`exit ${code}`); srv.close(); });
});
