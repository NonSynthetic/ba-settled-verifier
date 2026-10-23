#!/usr/bin/env node
// Independent on-chain check of every row in BasedAgents' "Recently paid" feed.
// Node 18+, built-ins only. GET requests and read-only JSON-RPC calls only.
//
//   node verify-settled.mjs [--rpc https://mainnet.base.org] [--api https://api.basedagents.ai]
//
// Exit code 0 only if every row passes.

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const API = arg('--api', 'https://api.basedagents.ai').replace(/\/$/, '');
const RPC = arg('--rpc', 'https://mainnet.base.org');
const NETWORK = 'eip155:8453';
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// At most 5 requests per second across API and RPC together.
const MIN_GAP_MS = 200;
let lastRequest = 0;
async function throttle() {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

async function getJson(url) {
  await throttle();
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function rpcOnce(method, params) {
  await throttle();
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC error ${body.error.code}: ${body.error.message}`);
  return body.result;
}

// Retry an RPC error once before calling it a failure.
async function rpc(method, params) {
  try {
    return await rpcOnce(method, params);
  } catch (first) {
    try {
      return await rpcOnce(method, params);
    } catch (second) {
      throw new Error(`${second.message} (after one retry; first: ${first.message})`);
    }
  }
}

// "1.00" -> 1000000n, integer math only. Rejects anything that is not a plain
// non-negative decimal with at most 6 fractional digits.
function displayToAtomic(display) {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(display).trim());
  if (!m) throw new Error(`amount_display "${display}" is not a decimal with <= 6 places`);
  return BigInt(m[1]) * 1000000n + BigInt((m[2] || '').padEnd(6, '0') || '0');
}

const topicToAddress = (topic) => '0x' + topic.slice(-40).toLowerCase();
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

async function main() {
  const x402 = await getJson(`${API}/.well-known/x402`);
  const accept = (x402.accepts || []).find((a) => a.network === NETWORK);
  if (!accept?.asset) throw new Error(`no accepts[] entry with asset for ${NETWORK} in /.well-known/x402`);
  const usdc = accept.asset.toLowerCase();
  const escrow = x402.escrow?.wallet ? x402.escrow.wallet.toLowerCase() : null;
  console.log(`USDC contract (${NETWORK}): ${usdc}`);
  console.log(`escrow wallet: ${escrow ?? '(none published)'}`);
  console.log(`RPC: ${RPC}`);

  const rows = [];
  let cursor = null;
  do {
    const url = `${API}/v1/tasks/settled?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(url);
    rows.push(...(page.tasks || []));
    cursor = page.next_cursor ?? null;
  } while (cursor);
  console.log(`feed rows: ${rows.length}\n`);

  const wallets = new Map();
  let passed = 0;
  let failed = 0;
  for (const row of rows) {
    const id = row.task_id;
    const fail = (why) => { failed++; console.log(`${id}  FAIL  ${why}`); };
    try {
      if (row.bounty?.network !== NETWORK) { fail(`bounty.network is ${row.bounty?.network}, expected ${NETWORK}`); continue; }
      if (!row.tx_hash) { fail('row has no tx_hash'); continue; }
      const agentId = row.agent?.id;
      if (!agentId) { fail('row has no agent.id'); continue; }
      if (!wallets.has(agentId)) {
        const w = await getJson(`${API}/v1/agents/${encodeURIComponent(agentId)}/wallet`);
        wallets.set(agentId, w.wallet_address || null);
      }
      const wallet = wallets.get(agentId);
      if (!wallet) { fail(`agent ${agentId} has no registered wallet now`); continue; }
      const expected = displayToAtomic(row.bounty.amount_display);

      const receipt = await rpc('eth_getTransactionReceipt', [row.tx_hash]);
      if (!receipt) { fail(`no receipt for ${row.tx_hash}`); continue; }
      if (receipt.status !== '0x1') { fail(`receipt status ${receipt.status}, expected 0x1`); continue; }

      const transfers = receipt.logs.filter((l) => same(l.address, usdc) && l.topics?.[0] === TRANSFER_TOPIC && l.topics.length === 3);
      if (!transfers.length) { fail(`no USDC Transfer log in ${row.tx_hash}`); continue; }
      const toAgent = transfers.filter((l) => same(topicToAddress(l.topics[2]), wallet));
      if (!toAgent.length) {
        const tos = transfers.map((l) => `${topicToAddress(l.topics[2])} ${BigInt(l.data)}`).join('; ');
        fail(`USDC Transfer goes to ${tos}, not to the agent's registered wallet ${wallet.toLowerCase()} (wallet changed after payout, or paid elsewhere)`);
        continue;
      }
      const exact = toAgent.find((l) => BigInt(l.data) === expected);
      if (!exact) {
        fail(`Transfer to agent is ${toAgent.map((l) => BigInt(l.data)).join(', ')} atomic, expected ${expected} (${row.bounty.amount_display} USDC)`);
        continue;
      }
      const from = topicToAddress(exact.topics[1]);
      const kind = escrow && from === escrow ? 'escrow payout' : 'direct buyer payment';
      passed++;
      console.log(`${id}  PASS  ${row.bounty.amount_display} USDC to ${wallet.toLowerCase()} from ${from} (${kind}), block ${parseInt(receipt.blockNumber, 16)}, tx ${row.tx_hash}`);
    } catch (e) {
      fail(e.message);
    }
  }
  console.log(`\nSummary: ${rows.length} rows, ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 && rows.length > 0 ? 0 : 1;
}

main().catch((e) => { console.error(`fatal: ${e.message}`); process.exitCode = 2; });
// doctored
