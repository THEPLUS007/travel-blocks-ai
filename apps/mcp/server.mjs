import { createFallbackTravelResult } from './itineraryFallback.mjs';

const realMcpProviderEnabled = process.env.TRAVEL_BLOCKS_USE_MOCK === 'false';

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function logError(message, error) {
  const suffix = error instanceof Error ? `: ${error.message}` : '';
  process.stderr.write(`[travel-blocks-mcp] ${message}${suffix}\n`);
}

function createResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function createError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}

function isNotification(request) {
  return request && typeof request === 'object' && request.id === undefined;
}

function listTools(id) {
  return createResponse(id, {
    tools: [
      {
        name: 'analyze_travel_source',
        description: 'Analyze travel text or URL context and return an input-based deterministic fallback itinerary without external credentials.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceType: {
              type: 'string',
              enum: ['youtube', 'blog', 'text'],
              description: 'Input source type inferred or selected by the caller.',
            },
            content: {
              type: 'string',
              description: 'Travel URL, blog URL, YouTube URL string, or free-form itinerary request.',
            },
          },
          additionalProperties: false,
        },
      },
    ],
  });
}

function callTool(id, params) {
  const toolName = params?.name;
  const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};

  if (toolName !== 'analyze_travel_source') {
    return createError(id, -32602, `Unknown tool: ${toolName ?? 'undefined'}`);
  }

  const sourceType = typeof args.sourceType === 'string' ? args.sourceType : 'text';
  const content = typeof args.content === 'string' ? args.content : '';
  const mode = realMcpProviderEnabled ? 'deterministic-fallback' : 'deterministic-fallback';
  const result = createFallbackTravelResult(content, sourceType, mode);

  if (realMcpProviderEnabled) {
    result.note = 'Real MCP provider is not implemented. Returning input-based deterministic fallback without external credentials.';
  }

  return createResponse(id, {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  });
}

function handleRequest(request) {
  if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return createError(request?.id, -32600, 'Invalid Request');
  }

  if (request.method === 'notifications/initialized') {
    return null;
  }

  if (isNotification(request)) {
    return null;
  }

  if (request.method === 'initialize') {
    return createResponse(request.id, {
      protocolVersion: request.params?.protocolVersion ?? '2025-03-26',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'travel-blocks-ai-local',
        version: '0.1.0',
      },
    });
  }

  if (request.method === 'tools/list') {
    return listTools(request.id);
  }

  if (request.method === 'tools/call') {
    return callTool(request.id, request.params);
  }

  return createError(request.id, -32601, `Method not found: ${request.method}`);
}

function handleLine(line) {
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  let request;

  try {
    request = JSON.parse(trimmed);
  } catch (error) {
    logError('Parse error', error);
    writeJson(createError(null, -32700, 'Parse error'));
    return;
  }

  try {
    const response = handleRequest(request);

    if (response) {
      writeJson(response);
    }
  } catch (error) {
    logError('Request handling failed', error);
    writeJson(createError(request?.id, -32603, 'Internal error'));
  }
}

let buffer = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    handleLine(line);
  }
});

process.stdin.on('end', () => {
  if (buffer.trim()) {
    handleLine(buffer);
  }
});

process.stdin.on('error', (error) => {
  logError('stdin error', error);
});
