import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../mcp/server.mjs');

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function runMcpSession(lines) {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TRAVEL_BLOCKS_USE_MOCK: 'true',
    },
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  for (const line of lines) {
    child.stdin.write(line);
  }

  child.stdin.end();
  await Promise.race([
    once(child, 'exit'),
    wait(3000).then(() => {
      child.kill('SIGTERM');
      throw new Error('MCP server test timed out');
    }),
  ]);

  return { stdout, stderr };
}

function parseJsonLines(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

function createInitialize(id = 1) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'mcp-server-test', version: '1.0.0' },
    },
  });
}

function createToolCall(id, content, sourceType = 'text') {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name: 'analyze_travel_source',
      arguments: {
        sourceType,
        content,
      },
    },
  });
}

async function callAnalyze(content, id = 10) {
  const { stdout } = await runMcpSession([
    `${createToolCall(id, content)}\n`,
  ]);
  const [response] = parseJsonLines(stdout);
  return JSON.parse(response.result.content[0].text);
}

const initialize = createInitialize(1);
const initializedNotification = JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {},
});
const toolsList = JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
});
const toolCall = createToolCall(3, '부산 1박 2일 바다와 카페 중심 여행');

{
  const { stdout } = await runMcpSession([
    `${initialize}\n`,
    `${initializedNotification}\n`,
    `${toolsList}\n`,
    `${toolCall}\n`,
  ]);
  const responses = parseJsonLines(stdout);

  assert.equal(responses.length, 3, 'notification should not produce a response');
  assert.equal(responses[0].id, 1);
  assert.equal(responses[0].result.serverInfo.name, 'travel-blocks-ai-local');
  assert.equal(responses[1].id, 2);
  assert.equal(responses[1].result.tools[0].name, 'analyze_travel_source');
  assert.equal(responses[2].id, 3);
  assert.ok(Array.isArray(responses[2].result.content));
  assert.equal(responses[2].result.content[0].type, 'text');

  const toolPayload = JSON.parse(responses[2].result.content[0].text);
  assert.equal(toolPayload.mode, 'deterministic-fallback');
  assert.equal(toolPayload.analysis.destination, '부산');
  assert.ok(Array.isArray(toolPayload.days));
}

{
  const { stdout } = await runMcpSession([
    `${initialize}\n${toolsList}\n`,
  ]);
  const responses = parseJsonLines(stdout);

  assert.equal(responses.length, 2, 'multiple newline-delimited requests in one chunk should both respond');
  assert.equal(responses[0].id, 1);
  assert.equal(responses[1].id, 2);
}

{
  const { stdout } = await runMcpSession([
    '{bad json}\n',
    `${initialize.slice(0, 45)}`,
    `${initialize.slice(45)}\n`,
  ]);
  const responses = parseJsonLines(stdout);

  assert.equal(responses.length, 2, 'parse error should not stop later valid request');
  assert.equal(responses[0].error.code, -32700);
  assert.equal(responses[1].id, 1);
}

{
  const { stdout } = await runMcpSession([
    `${initialize}\n`,
  ]);
  const lines = stdout.split('\n').filter(Boolean);

  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), 'stdout must contain JSON-RPC JSON lines only');
  }
}

const scenarios = [
  {
    input: '부산 2박 3일 맛집 여행 일정을 만들어줘',
    destination: '부산',
    days: 3,
    theme: '미식',
    includes: '미식',
  },
  {
    input: '도쿄 3일 애니메이션 성지순례',
    destination: '도쿄',
    days: 3,
    theme: '콘텐츠·성지순례',
    includes: '성지순례',
  },
  {
    input: '제주 가족 당일치기',
    destination: '제주',
    days: 1,
    theme: '가족',
    includes: '가족',
  },
  {
    input: '오사카 쇼핑 여행',
    destination: '오사카',
    days: 2,
    theme: '쇼핑',
    includes: '쇼핑',
  },
  {
    input: '',
    destination: '추천 여행지',
    days: 2,
    theme: '종합 여행',
    includes: '추천 여행지',
  },
];

for (let index = 0; index < scenarios.length; index += 1) {
  const scenario = scenarios[index];
  const result = await callAnalyze(scenario.input, 20 + index);
  assert.equal(result.analysis.destination, scenario.destination);
  assert.equal(result.analysis.durationDays, scenario.days);
  assert.equal(result.analysis.theme, scenario.theme);
  assert.equal(result.days.length, scenario.days);
  assert.ok(result.days.every((day) => day.city === scenario.destination));
  assert.ok(result.days.every((day) => day.blocks.length >= 2));
  assert.ok(JSON.stringify(result).includes(scenario.includes));
}

{
  const first = await callAnalyze('부산 2박 3일 맛집 여행 일정을 만들어줘', 40);
  const second = await callAnalyze('부산 2박 3일 맛집 여행 일정을 만들어줘', 41);
  assert.deepEqual(first, second, 'same input should produce identical deterministic fallback output');
}

console.log('MCP server tests passed');
