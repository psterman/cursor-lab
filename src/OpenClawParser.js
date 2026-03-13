/**
 * OpenClawParser.js
 * Parse OpenClaw JSONL chat/event logs and build operational analytics.
 * Also supports materializing parsed records into an in-memory SQLite mirror.
 */

import initSqlJs from 'sql.js';
import { analyzeOpenClawPortrait } from './OpenClawPortraitAnalyzer.js';

const MODEL_PATHS = [
  'modelId',
  'model_id',
  'model',
  'request.model',
  'request.modelId',
  'response.model',
  'response.modelId',
  'metadata.modelId',
  'meta.modelId',
  'engine.modelId',
];

const TIMESTAMP_PATHS = [
  'timestamp',
  'time',
  'createdAt',
  'created_at',
  'eventTime',
  'event_time',
  'meta.timestamp',
  'metadata.timestamp',
  'ts',
  'startTime',
  'updatedAt',
];

const EXIT_CODE_PATHS = [
  'exitCode',
  'exit_code',
  'result.exitCode',
  'result.exit_code',
  'response.exitCode',
  'command.exitCode',
];

const ERROR_FLAG_PATHS = [
  'isError',
  'is_error',
  'error',
  'hasError',
  'status.isError',
  'result.isError',
];

const INTERRUPTION_FLAG_PATHS = [
  'isInterrupted',
  'interrupted',
  'aborted',
  'cancelled',
  'canceled',
  'terminated',
  'timedOut',
  'timeout',
];

const STATUS_PATHS = [
  'status',
  'state',
  'result.status',
  'result.state',
  'finishReason',
  'finish_reason',
  'reason',
];

const CWD_PATHS = [
  'cwd',
  'workingDirectory',
  'working_directory',
  'context.cwd',
  'meta.cwd',
  'metadata.cwd',
  'environment.cwd',
  'workspace.cwd',
];

const TOOL_CALL_PATHS = [
  'tool_calls',
  'toolCalls',
  'tools.calls',
  'tools',
  'toolInvocations',
  'tool_invocations',
  'events.tool_calls',
  'payload.tool_calls',
];

const SKILLS_SNAPSHOT_PATHS = [
  'skillsSnapshot',
  'skills_snapshot',
  'context.skillsSnapshot',
  'context.skills_snapshot',
  'meta.skillsSnapshot',
  'metadata.skillsSnapshot',
  'skills',
];

const MESSAGE_TEXT_PATHS = [
  'text',
  'message',
  'content',
  'prompt',
  'input',
  'input.text',
  'request.prompt',
  'request.content',
  'response.text',
  'response.content',
  'output',
  'assistant_message',
  'user_message',
  'body',
  'body.text',
  'body.content',
  'data',
  'data.text',
  'data.content',
  'event.message',
  'event.content',
  'payload',
  'payload.text',
  'payload.content',
  'result.text',
  'result.content',
  'choices.0.message.content',
  'message.content',
];

const RESERVED_SKILL_KEYS = new Set([
  'name',
  'id',
  'key',
  'path',
  'fullPath',
  'count',
  'calls',
  'usageCount',
  'frequency',
  'hits',
  'timestamp',
  'createdAt',
  'updatedAt',
  'meta',
  'metadata',
  'version',
  'type',
]);

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'from',
  'as',
  'by',
  'this',
  'that',
  'it',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'my',
  'your',
  'our',
  'their',
  'and',
  'or',
  'if',
  'then',
  'else',
  'can',
  'could',
  'will',
  'would',
  'should',
  'please',
  'help',
  'how',
  'what',
  'why',
  'when',
  'where',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'ok', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
}

function toISOTime(value, fallbackISO) {
  if (value == null) return fallbackISO;
  let d = null;

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    d = new Date(ms);
  } else if (typeof value === 'string') {
    const n = toFiniteNumber(value);
    if (n != null && /^\d+(\.\d+)?$/.test(value.trim())) {
      const ms = n > 1e12 ? n : n * 1000;
      d = new Date(ms);
    } else {
      d = new Date(value);
    }
  } else if (value instanceof Date) {
    d = value;
  }

  if (!d || Number.isNaN(d.getTime())) {
    return fallbackISO;
  }
  return d.toISOString();
}

function normalizeCwd(pathValue) {
  if (typeof pathValue !== 'string') return null;
  const trimmed = pathValue.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '{}';
  }
}

function looksLikeErrorStatus(status) {
  if (typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return s.includes('error') || s.includes('fail');
}

function looksLikeInterruptedStatus(status) {
  if (typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return (
    s.includes('interrupt') ||
    s.includes('cancel') ||
    s.includes('abort') ||
    s.includes('timeout') ||
    s.includes('killed') ||
    s.includes('terminated')
  );
}

/**
 * OpenClaw parser for JSONL logs.
 * Keeps a CursorParser-like API: init/loadDatabase/scanDatabase/getStats/getAllData.
 */
export class OpenClawParser {
  constructor() {
    this.SQL = null;
    this.db = null;
    this.rawJSONL = '';
    this.rawRecords = [];
    this.normalizedRecords = [];
    this.chatData = [];
    this.invalidJsonLines = 0;
    this.onProgress = () => {};
    this.stats = this.createEmptyStats();
  }

  createEmptyStats() {
    return {
      totalRecords: 0,
      totalConversations: 0,
      userMessages: 0,
      aiMessages: 0,
      invalidJsonLines: 0,
      modelUsage: {},
      modelFrequency: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        totalCostUSD: 0,
      },
      skillsUsage: {},
      skillsByName: {},
      skillsTree: { name: 'root', count: 0, children: [] },
      skillsSnapshots: 0,
      toolUsage: {},
      toolCallsTotal: 0,
      toolSuccessCount: 0,
      toolFailureCount: 0,
      toolSuccessRate: 0,
      eventsWithExitCode: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      errorCount: 0,
      abnormalInterruptions: 0,
      abnormalInterruptionRate: 0,
      cache: {
        requests: 0,
        hits: 0,
        hitRate: 0,
        tokenHitRate: 0,
      },
      cacheHitRate: 0,
      cacheHitTokenRate: 0,
      cwdUsage: {},
      topCwds: [],
      hourlyActivity: new Array(24).fill(0),
      hourlyHeatmap: new Array(24).fill(0),
      dailyActivity: {},
      firstTimestamp: null,
      lastTimestamp: null,
      topPrompts: {},
      topChineseWords: {},
      sqliteMaterialized: false,
    };
  }

  resetStats() {
    this.stats = this.createEmptyStats();
  }

  async init() {
    if (this.SQL) return;
    const basePath = typeof window !== 'undefined' ? (window.BASE_PATH || '') : '';
    const wasmPath = basePath ? `${basePath}/sql-wasm.wasm` : './sql-wasm.wasm';
    this.SQL = await initSqlJs({
      locateFile: (file) => (file.endsWith('.wasm') ? wasmPath : file),
    });
  }

  decodeInput(input) {
    if (typeof input === 'string') return input;
    if (input instanceof ArrayBuffer) {
      return new TextDecoder('utf-8').decode(new Uint8Array(input));
    }
    if (ArrayBuffer.isView(input)) {
      return new TextDecoder('utf-8').decode(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    }
    throw new Error('Unsupported input type: expected JSONL string or ArrayBuffer.');
  }

  /**
   * Compatibility alias with CursorParser: loadDatabase(arrayBuffer).
   * For OpenClaw, this expects JSONL content instead of SQLite bytes.
   */
  async loadDatabase(input) {
    return this.loadJSONL(input);
  }

  async loadJSONL(input) {
    const text = this.decodeInput(input);
    this.rawJSONL = (text || '').replace(/^\uFEFF/, '');
    const lines = this.rawJSONL.split(/\r?\n/);

    this.rawRecords = [];
    this.invalidJsonLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      try {
        this.rawRecords.push({
          lineNumber: i + 1,
          rawLine,
          record: JSON.parse(rawLine),
        });
      } catch (_) {
        this.invalidJsonLines += 1;
      }
    }

    return true;
  }

  /**
   * Compatibility alias with CursorParser: scanDatabase(options).
   */
  async scanDatabase(options = {}) {
    return this.scanJSONL(options);
  }

  async scanJSONL(options = {}) {
    if (!Array.isArray(this.rawRecords) || this.rawRecords.length === 0) {
      throw new Error('No JSONL records loaded. Call loadJSONL/loadDatabase first.');
    }

    const { limit = null, onProgress = null, materializeSQLite = true } = options;

    this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
    this.chatData = [];
    this.normalizedRecords = [];
    this.resetStats();
    this.stats.invalidJsonLines = this.invalidJsonLines;

    const selected = Number.isFinite(limit) && limit > 0
      ? this.rawRecords.slice(-limit)
      : this.rawRecords;

    const total = Math.max(1, selected.length);
    for (let i = 0; i < selected.length; i++) {
      const row = selected[i];
      const normalized = this.normalizeRecord(row.record, row.lineNumber, i + 1);
      this.normalizedRecords.push(normalized);
      this.updateStats(normalized);
      this.onProgress(i + 1, total);
    }

    this.finalizeStats();

    if (materializeSQLite) {
      await this.materializeSQLiteMirror(this.normalizedRecords);
      this.stats.sqliteMaterialized = true;
    } else {
      this.stats.sqliteMaterialized = false;
    }

    return this.chatData;
  }

  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(part)) {
        current = current[Number(part)];
        continue;
      }
      if (isObject(current) && Object.prototype.hasOwnProperty.call(current, part)) {
        current = current[part];
        continue;
      }
      return undefined;
    }
    return current;
  }

  getFirstValue(obj, paths) {
    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  getFirstString(obj, paths) {
    const value = this.getFirstValue(obj, paths);
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    return null;
  }

  getFirstNumber(obj, paths) {
    const value = this.getFirstValue(obj, paths);
    return toFiniteNumber(value);
  }

  getFirstBoolean(obj, paths) {
    const value = this.getFirstValue(obj, paths);
    return toBoolean(value);
  }

  extractTimestamp(record) {
    const fallback = new Date().toISOString();
    const raw = this.getFirstValue(record, TIMESTAMP_PATHS);
    return toISOTime(raw, fallback);
  }

  extractModelId(record) {
    const value = this.getFirstString(record, MODEL_PATHS);
    return value || 'unknown';
  }

  extractUsage(record) {
    const promptTokens = this.getFirstNumber(record, [
      'usage.prompt_tokens',
      'usage.promptTokens',
      'usage.input_tokens',
      'usage.inputTokens',
      'usage.request_tokens',
      'prompt_tokens',
      'promptTokens',
      'input_tokens',
      'inputTokens',
    ]) || 0;

    const completionTokens = this.getFirstNumber(record, [
      'usage.completion_tokens',
      'usage.completionTokens',
      'usage.output_tokens',
      'usage.outputTokens',
      'usage.response_tokens',
      'completion_tokens',
      'completionTokens',
      'output_tokens',
      'outputTokens',
    ]) || 0;

    const totalTokensRaw = this.getFirstNumber(record, [
      'usage.total_tokens',
      'usage.totalTokens',
      'total_tokens',
      'totalTokens',
      'tokens',
    ]);
    const totalTokens = totalTokensRaw != null ? totalTokensRaw : (promptTokens + completionTokens);

    const cachedTokens = this.getFirstNumber(record, [
      'usage.cached_tokens',
      'usage.cachedTokens',
      'usage.input_tokens_details.cached_tokens',
      'usage.prompt_tokens_details.cached_tokens',
      'cache.cached_tokens',
      'cache.cachedTokens',
      'cached_tokens',
      'cachedTokens',
    ]) || 0;

    const totalCostUSD = this.getFirstNumber(record, [
      'usage.total_cost_usd',
      'usage.totalCostUSD',
      'usage.total_cost',
      'usage.totalCost',
      'usage.cost',
      'total_cost_usd',
      'totalCostUSD',
      'cost_usd',
      'cost',
    ]) || 0;

    const cacheHit = this.getFirstBoolean(record, [
      'cache.hit',
      'cache_hit',
      'cacheHit',
      'usage.cache_hit',
      'usage.cacheHit',
      'usage.cached',
    ]);

    return {
      promptTokens: Math.max(0, Math.trunc(promptTokens)),
      completionTokens: Math.max(0, Math.trunc(completionTokens)),
      totalTokens: Math.max(0, Math.trunc(totalTokens)),
      cachedTokens: Math.max(0, Math.trunc(cachedTokens)),
      totalCostUSD: Math.max(0, totalCostUSD),
      cacheHit,
    };
  }

  normalizeToolCall(rawTool, fallbackTimestamp) {
    if (typeof rawTool === 'string') {
      const name = rawTool.trim();
      if (!name) return null;
      return {
        name,
        exitCode: null,
        isError: false,
        isInterrupted: false,
        cwd: null,
        timestamp: fallbackTimestamp,
      };
    }

    if (!isObject(rawTool)) return null;

    const name = this.getFirstString(rawTool, [
      'name',
      'toolName',
      'tool_name',
      'function.name',
      'functionName',
      'tool.name',
      'command.name',
    ]) || 'unknown';

    const exitCode = this.getFirstNumber(rawTool, [
      'exitCode',
      'exit_code',
      'result.exitCode',
      'result.exit_code',
      'response.exitCode',
    ]);
    const normalizedExitCode = exitCode == null ? null : Math.trunc(exitCode);

    const explicitError = this.getFirstBoolean(rawTool, [
      'isError',
      'error',
      'failed',
      'status.isError',
    ]);
    const status = this.getFirstString(rawTool, STATUS_PATHS);

    const explicitInterrupted = this.getFirstBoolean(rawTool, INTERRUPTION_FLAG_PATHS);
    const interruptedByStatus = status ? looksLikeInterruptedStatus(status) : false;

    const isError = explicitError != null
      ? explicitError
      : (normalizedExitCode != null ? normalizedExitCode !== 0 : (status ? looksLikeErrorStatus(status) : false));

    const isInterrupted = explicitInterrupted != null
      ? explicitInterrupted
      : interruptedByStatus;

    const timestamp = toISOTime(this.getFirstValue(rawTool, TIMESTAMP_PATHS), fallbackTimestamp);
    const cwd = normalizeCwd(this.getFirstString(rawTool, CWD_PATHS));

    return {
      name,
      exitCode: normalizedExitCode,
      isError,
      isInterrupted,
      cwd,
      timestamp,
    };
  }

  extractToolCalls(record, fallbackTimestamp) {
    const raw = this.getFirstValue(record, TOOL_CALL_PATHS);
    const queue = [];

    if (Array.isArray(raw)) {
      queue.push(...raw);
    } else if (isObject(raw)) {
      if (Array.isArray(raw.calls)) {
        queue.push(...raw.calls);
      } else if (Array.isArray(raw.items)) {
        queue.push(...raw.items);
      } else if (raw.name || raw.toolName || raw.function || raw.command) {
        queue.push(raw);
      } else {
        for (const value of Object.values(raw)) {
          if (Array.isArray(value)) queue.push(...value);
          else if (isObject(value) || typeof value === 'string') queue.push(value);
        }
      }
    }

    if (queue.length === 0) {
      const fallbackName = this.getFirstString(record, ['toolName', 'tool_name', 'tool']);
      if (fallbackName) {
        queue.push({
          name: fallbackName,
          exitCode: this.getFirstNumber(record, EXIT_CODE_PATHS),
          isError: this.getFirstBoolean(record, ERROR_FLAG_PATHS),
          timestamp: fallbackTimestamp,
          cwd: this.getFirstString(record, CWD_PATHS),
        });
      }
    }

    const normalized = [];
    for (const item of queue) {
      const tool = this.normalizeToolCall(item, fallbackTimestamp);
      if (tool) normalized.push(tool);
    }
    return normalized;
  }

  joinSkillPath(parentPath, childName) {
    const parent = (parentPath || '').trim();
    const child = (childName || '').trim();
    if (!child) return parent || '';
    return parent ? `${parent}/${child}` : child;
  }

  flattenSkills(input, parentPath = '', out = []) {
    if (input == null) return out;

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed) {
        out.push({
          name: trimmed,
          path: this.joinSkillPath(parentPath, trimmed),
          count: 1,
        });
      }
      return out;
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        this.flattenSkills(item, parentPath, out);
      }
      return out;
    }

    if (!isObject(input)) {
      return out;
    }

    const explicitName = this.getFirstString(input, [
      'name',
      'skill',
      'skillName',
      'id',
      'key',
      'slug',
      'title',
    ]);
    const explicitPath = this.getFirstString(input, ['path', 'fullPath', 'skillPath']);
    const rawCount = this.getFirstNumber(input, ['count', 'usageCount', 'calls', 'frequency', 'hits']);
    const count = rawCount != null ? Math.max(1, Math.trunc(rawCount)) : 1;

    let nextPath = parentPath;
    if (explicitName) {
      nextPath = explicitPath || this.joinSkillPath(parentPath, explicitName);
      out.push({
        name: explicitName,
        path: nextPath,
        count,
      });
    }

    const childCandidate = this.getFirstValue(input, [
      'children',
      'items',
      'skills',
      'subskills',
      'subSkills',
      'nodes',
    ]);
    if (childCandidate && childCandidate !== input) {
      this.flattenSkills(childCandidate, nextPath, out);
    }

    if (!explicitName) {
      for (const [key, value] of Object.entries(input)) {
        if (RESERVED_SKILL_KEYS.has(key)) continue;

        if (typeof value === 'boolean') {
          if (value) {
            out.push({
              name: key,
              path: this.joinSkillPath(parentPath, key),
              count: 1,
            });
          }
          continue;
        }

        if (typeof value === 'number') {
          out.push({
            name: key,
            path: this.joinSkillPath(parentPath, key),
            count: Math.max(1, Math.trunc(value)),
          });
          continue;
        }

        if (typeof value === 'string') {
          const maybeCount = toFiniteNumber(value);
          if (maybeCount != null) {
            out.push({
              name: key,
              path: this.joinSkillPath(parentPath, key),
              count: Math.max(1, Math.trunc(maybeCount)),
            });
          } else {
            out.push({
              name: value,
              path: this.joinSkillPath(parentPath, value),
              count: 1,
            });
          }
          continue;
        }

        if (Array.isArray(value) || isObject(value)) {
          this.flattenSkills(value, this.joinSkillPath(parentPath, key), out);
        }
      }
    }

    return out;
  }

  extractSkillsSnapshot(record) {
    const rawSnapshot = this.getFirstValue(record, SKILLS_SNAPSHOT_PATHS);
    if (rawSnapshot == null) {
      return { rawSnapshot: null, skills: [] };
    }
    return { rawSnapshot, skills: this.flattenSkills(rawSnapshot) };
  }

  extractCwd(record, toolCalls) {
    const fromRecord = normalizeCwd(this.getFirstString(record, CWD_PATHS));
    if (fromRecord) return fromRecord;

    for (const call of toolCalls || []) {
      const value = normalizeCwd(call.cwd);
      if (value) return value;
    }

    return null;
  }

  extractRole(record) {
    const raw = this.getFirstString(record, ['role', 'type', 'sender', 'author.role']);
    if (!raw) return 'unknown';
    const normalized = raw.toLowerCase();
    if (normalized.includes('user') || normalized.includes('human')) return 'USER';
    if (normalized.includes('assistant') || normalized.includes('ai') || normalized.includes('model') || normalized.includes('system')) {
      return 'AI';
    }
    return 'unknown';
  }

  extractText(record) {
    for (const path of MESSAGE_TEXT_PATHS) {
      const value = this.getNestedValue(record, path);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const messages = this.getFirstValue(record, ['messages', 'conversation.messages', 'chat.messages']);
    if (Array.isArray(messages)) {
      const collected = [];
      for (const msg of messages) {
        if (typeof msg === 'string' && msg.trim()) collected.push(msg.trim());
        else if (isObject(msg)) {
          const text = this.getFirstString(msg, ['text', 'content', 'message']);
          if (text) collected.push(text);
        }
      }
      if (collected.length > 0) return collected.join('\n');
    }

    return '';
  }

  extractExitCode(record, toolCalls) {
    const fromRecord = this.getFirstNumber(record, EXIT_CODE_PATHS);
    if (fromRecord != null) return Math.trunc(fromRecord);

    const toolExitCodes = (toolCalls || [])
      .map((call) => call.exitCode)
      .filter((code) => code != null);

    if (toolExitCodes.length === 0) return null;
    if (toolExitCodes.some((code) => code !== 0)) {
      return toolExitCodes.find((code) => code !== 0) ?? 0;
    }
    return 0;
  }

  extractIsError(record, exitCode, toolCalls) {
    const explicit = this.getFirstBoolean(record, ERROR_FLAG_PATHS);
    if (explicit != null) return explicit;

    const status = this.getFirstString(record, STATUS_PATHS);
    if (status && looksLikeErrorStatus(status)) return true;

    if ((toolCalls || []).some((call) => call.isError)) return true;
    if (exitCode != null && exitCode !== 0) return true;
    return false;
  }

  extractInterrupted(record, toolCalls) {
    const explicit = this.getFirstBoolean(record, INTERRUPTION_FLAG_PATHS);
    if (explicit != null) return explicit;

    const status = this.getFirstString(record, STATUS_PATHS);
    if (status && looksLikeInterruptedStatus(status)) return true;

    if ((toolCalls || []).some((call) => call.isInterrupted)) return true;
    return false;
  }

  normalizeRecord(record, lineNumber, sequence) {
    const timestamp = this.extractTimestamp(record);
    const modelId = this.extractModelId(record);
    const usage = this.extractUsage(record);
    const toolCalls = this.extractToolCalls(record, timestamp);
    const skillsSnapshot = this.extractSkillsSnapshot(record);
    const exitCode = this.extractExitCode(record, toolCalls);
    const isError = this.extractIsError(record, exitCode, toolCalls);
    const isInterrupted = this.extractInterrupted(record, toolCalls);
    const cwd = this.extractCwd(record, toolCalls);
    const role = this.extractRole(record);
    const text = this.extractText(record);

    return {
      sequence,
      lineNumber,
      timestamp,
      modelId,
      usage,
      toolCalls,
      skillsSnapshot: skillsSnapshot.rawSnapshot,
      skills: skillsSnapshot.skills,
      cwd,
      role,
      text,
      exitCode,
      isError,
      isInterrupted,
      raw: record,
    };
  }

  updateWordStats(text) {
    if (!text) return;

    const englishMatches = text.match(/\b[a-zA-Z]{2,20}\b/g) || [];
    for (const wordRaw of englishMatches) {
      const word = wordRaw.toLowerCase();
      if (STOP_WORDS.has(word)) continue;
      this.stats.topPrompts[word] = (this.stats.topPrompts[word] || 0) + 1;
    }

    const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,10}/g) || [];
    for (const phrase of chineseMatches) {
      this.stats.topChineseWords[phrase] = (this.stats.topChineseWords[phrase] || 0) + 1;
    }
  }

  updateStats(normalized) {
    this.stats.totalRecords += 1;
    this.stats.totalConversations += 1;

    if (normalized.role === 'USER') this.stats.userMessages += 1;
    else if (normalized.role === 'AI') this.stats.aiMessages += 1;

    const model = normalized.modelId || 'unknown';
    this.stats.modelUsage[model] = (this.stats.modelUsage[model] || 0) + 1;

    this.stats.usage.promptTokens += normalized.usage.promptTokens;
    this.stats.usage.completionTokens += normalized.usage.completionTokens;
    this.stats.usage.totalTokens += normalized.usage.totalTokens;
    this.stats.usage.cachedTokens += normalized.usage.cachedTokens;
    this.stats.usage.totalCostUSD += normalized.usage.totalCostUSD;

    const hasCacheSignal = (
      normalized.usage.promptTokens > 0 ||
      normalized.usage.cachedTokens > 0 ||
      normalized.usage.cacheHit != null
    );
    if (hasCacheSignal) {
      this.stats.cache.requests += 1;
      if (normalized.usage.cacheHit === true || normalized.usage.cachedTokens > 0) {
        this.stats.cache.hits += 1;
      }
    }

    if (normalized.exitCode != null) {
      this.stats.eventsWithExitCode += 1;
      if (normalized.exitCode === 0) this.stats.successCount += 1;
      else this.stats.failureCount += 1;
    }

    if (normalized.isError) this.stats.errorCount += 1;
    if (normalized.isInterrupted) this.stats.abnormalInterruptions += 1;

    for (const toolCall of normalized.toolCalls) {
      this.stats.toolCallsTotal += 1;
      const toolName = toolCall.name || 'unknown';
      this.stats.toolUsage[toolName] = (this.stats.toolUsage[toolName] || 0) + 1;

      if (toolCall.exitCode != null) {
        if (toolCall.exitCode === 0) this.stats.toolSuccessCount += 1;
        else this.stats.toolFailureCount += 1;
      } else if (toolCall.isError) {
        this.stats.toolFailureCount += 1;
      }
    }

    if (normalized.skills.length > 0 || normalized.skillsSnapshot != null) {
      this.stats.skillsSnapshots += 1;
    }
    for (const skill of normalized.skills) {
      const pathKey = skill.path || skill.name || 'unknown';
      const nameKey = skill.name || pathKey;
      const weight = Math.max(1, Math.trunc(skill.count || 1));
      this.stats.skillsUsage[pathKey] = (this.stats.skillsUsage[pathKey] || 0) + weight;
      this.stats.skillsByName[nameKey] = (this.stats.skillsByName[nameKey] || 0) + weight;
    }

    if (normalized.cwd) {
      this.stats.cwdUsage[normalized.cwd] = (this.stats.cwdUsage[normalized.cwd] || 0) + 1;
    }

    const date = new Date(normalized.timestamp);
    if (!Number.isNaN(date.getTime())) {
      const hour = date.getHours();
      this.stats.hourlyActivity[hour] += 1;

      const dateKey = date.toISOString().slice(0, 10);
      this.stats.dailyActivity[dateKey] = (this.stats.dailyActivity[dateKey] || 0) + 1;

      if (!this.stats.firstTimestamp || normalized.timestamp < this.stats.firstTimestamp) {
        this.stats.firstTimestamp = normalized.timestamp;
      }
      if (!this.stats.lastTimestamp || normalized.timestamp > this.stats.lastTimestamp) {
        this.stats.lastTimestamp = normalized.timestamp;
      }
    }

    if (normalized.text) {
      this.chatData.push({
        id: this.chatData.length + 1,
        text: normalized.text,
        role: normalized.role,
        source: 'openclaw_jsonl',
        length: normalized.text.length,
        timestamp: normalized.timestamp,
        model: normalized.modelId,
      });
      this.updateWordStats(normalized.text);
    } else {
      // 无文本的事件仍计入一条占位，避免「未找到任何对话数据」且保证 portrait 有统计
      this.chatData.push({
        id: this.chatData.length + 1,
        text: `[OpenClaw 事件 #${normalized.sequence}]`,
        role: normalized.role,
        source: 'openclaw_jsonl',
        length: 0,
        timestamp: normalized.timestamp,
        model: normalized.modelId,
      });
    }
  }

  buildSkillTree(skillsUsage) {
    const root = { name: 'root', count: 0, children: {} };

    for (const [skillPath, rawCount] of Object.entries(skillsUsage || {})) {
      const count = Math.max(1, Math.trunc(rawCount || 1));
      const segments = String(skillPath)
        .split(/[/>|:]+/g)
        .map((seg) => seg.trim())
        .filter(Boolean);
      if (segments.length === 0) continue;

      root.count += count;
      let cursor = root;
      for (const seg of segments) {
        if (!cursor.children[seg]) {
          cursor.children[seg] = { name: seg, count: 0, children: {} };
        }
        cursor = cursor.children[seg];
        cursor.count += count;
      }
    }

    const serialize = (node) => {
      const children = Object.values(node.children || {})
        .sort((a, b) => b.count - a.count)
        .map(serialize);
      return { name: node.name, count: node.count, children };
    };

    return serialize(root);
  }

  finalizeStats() {
    this.stats.modelFrequency = Object.entries(this.stats.modelUsage)
      .sort((a, b) => b[1] - a[1])
      .map(([modelId, count]) => ({ modelId, count }));

    this.stats.topCwds = Object.entries(this.stats.cwdUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([cwd, count]) => ({ cwd, count }));

    this.stats.hourlyHeatmap = this.stats.hourlyActivity.map((count, hour) => ({ hour, count }));

    const successBase = this.stats.eventsWithExitCode || 0;
    this.stats.successRate = successBase > 0 ? this.stats.successCount / successBase : 0;

    const totalEvents = this.stats.totalRecords || 0;
    this.stats.abnormalInterruptionRate = totalEvents > 0
      ? this.stats.abnormalInterruptions / totalEvents
      : 0;

    const toolBase = this.stats.toolSuccessCount + this.stats.toolFailureCount;
    this.stats.toolSuccessRate = toolBase > 0 ? this.stats.toolSuccessCount / toolBase : 0;

    this.stats.cache.hitRate = this.stats.cache.requests > 0
      ? this.stats.cache.hits / this.stats.cache.requests
      : 0;
    this.stats.cache.tokenHitRate = this.stats.usage.promptTokens > 0
      ? this.stats.usage.cachedTokens / this.stats.usage.promptTokens
      : 0;

    this.stats.cacheHitRate = this.stats.cache.hitRate;
    this.stats.cacheHitTokenRate = this.stats.cache.tokenHitRate;
    this.stats.skillsTree = this.buildSkillTree(this.stats.skillsUsage);
  }

  async materializeSQLiteMirror(records) {
    await this.init();

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.db = new this.SQL.Database();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS openclaw_events (
        id INTEGER PRIMARY KEY,
        line_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        hour INTEGER NOT NULL,
        model_id TEXT,
        role TEXT,
        cwd TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cached_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        exit_code INTEGER,
        is_error INTEGER NOT NULL DEFAULT 0,
        is_interrupted INTEGER NOT NULL DEFAULT 0,
        cache_hit INTEGER,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS openclaw_tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        exit_code INTEGER,
        is_error INTEGER NOT NULL DEFAULT 0,
        is_interrupted INTEGER NOT NULL DEFAULT 0,
        cwd TEXT,
        timestamp TEXT,
        FOREIGN KEY(event_id) REFERENCES openclaw_events(id)
      );

      CREATE TABLE IF NOT EXISTS openclaw_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        skill_name TEXT NOT NULL,
        skill_path TEXT,
        weight INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(event_id) REFERENCES openclaw_events(id)
      );

      CREATE INDEX IF NOT EXISTS idx_openclaw_events_timestamp ON openclaw_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_openclaw_events_model ON openclaw_events(model_id);
      CREATE INDEX IF NOT EXISTS idx_openclaw_tool_calls_tool_name ON openclaw_tool_calls(tool_name);
      CREATE INDEX IF NOT EXISTS idx_openclaw_skills_name ON openclaw_skills(skill_name);
    `);

    const insertEvent = this.db.prepare(`
      INSERT INTO openclaw_events (
        id, line_number, timestamp, hour, model_id, role, cwd,
        prompt_tokens, completion_tokens, total_tokens, cached_tokens, cost_usd,
        exit_code, is_error, is_interrupted, cache_hit, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTool = this.db.prepare(`
      INSERT INTO openclaw_tool_calls (
        event_id, tool_name, exit_code, is_error, is_interrupted, cwd, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSkill = this.db.prepare(`
      INSERT INTO openclaw_skills (
        event_id, skill_name, skill_path, weight
      ) VALUES (?, ?, ?, ?)
    `);

    try {
      for (const row of records) {
        const date = new Date(row.timestamp);
        const hour = Number.isNaN(date.getTime()) ? 0 : date.getHours();
        const cacheHitFlag = row.usage.cacheHit == null ? null : (row.usage.cacheHit ? 1 : 0);

        insertEvent.run([
          row.sequence,
          row.lineNumber,
          row.timestamp,
          hour,
          row.modelId || 'unknown',
          row.role || 'unknown',
          row.cwd || null,
          row.usage.promptTokens,
          row.usage.completionTokens,
          row.usage.totalTokens,
          row.usage.cachedTokens,
          row.usage.totalCostUSD,
          row.exitCode,
          row.isError ? 1 : 0,
          row.isInterrupted ? 1 : 0,
          cacheHitFlag,
          safeJsonStringify(row.raw),
        ]);

        for (const toolCall of row.toolCalls) {
          insertTool.run([
            row.sequence,
            toolCall.name || 'unknown',
            toolCall.exitCode,
            toolCall.isError ? 1 : 0,
            toolCall.isInterrupted ? 1 : 0,
            toolCall.cwd || null,
            toolCall.timestamp || row.timestamp,
          ]);
        }

        for (const skill of row.skills) {
          insertSkill.run([
            row.sequence,
            skill.name || 'unknown',
            skill.path || null,
            Math.max(1, Math.trunc(skill.count || 1)),
          ]);
        }
      }
    } finally {
      insertEvent.free();
      insertTool.free();
      insertSkill.free();
    }
  }

  /**
   * Export in-memory SQLite bytes (Uint8Array).
   * Useful when you want a portable SQLite inventory from JSONL.
   */
  exportSQLite() {
    if (!this.db) return null;
    return this.db.export();
  }

  async toSQLiteInventory(options = {}) {
    const { forceRebuild = false } = options;
    if (forceRebuild || !this.db) {
      if (!this.normalizedRecords || this.normalizedRecords.length === 0) {
        await this.scanJSONL({ materializeSQLite: true });
      } else {
        await this.materializeSQLiteMirror(this.normalizedRecords);
      }
    }
    return this.exportSQLite();
  }

  getAllData() {
    return this.chatData;
  }

  getStats() {
    return {
      ...this.stats,
      topPrompts: this.getTopPrompts(50),
      topChineseWordsList: this.getTopChineseWords(50),
    };
  }

  getPortraitAnalysis(options = {}) {
    return analyzeOpenClawPortrait({
      stats: this.getStats(),
      records: this.normalizedRecords || [],
    }, options);
  }

  getTopPrompts(limit = 20) {
    return Object.entries(this.stats.topPrompts || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([prompt, count]) => ({ prompt, count }));
  }

  getTopChineseWords(limit = 20) {
    return Object.entries(this.stats.topChineseWords || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  search(keyword) {
    if (!keyword) return this.chatData;
    const needle = String(keyword).toLowerCase();
    return this.chatData.filter((item) => String(item.text || '').toLowerCase().includes(needle));
  }

  getPayloadForAnalysis() {
    const messages = this.chatData.slice(-80).map((item) => ({
      role: item.role || 'unknown',
      content: this.sanitizeSensitiveData(item.text || ''),
      timestamp: item.timestamp,
    }));

    return {
      meta: {
        total_conversations: this.stats.totalConversations,
        top_model: this.stats.modelFrequency[0]?.modelId || 'unknown',
        hourly_distribution: [...this.stats.hourlyActivity],
        total_tokens: this.stats.usage.totalTokens,
        total_cost_usd: this.stats.usage.totalCostUSD,
      },
      messages,
      exportTime: new Date().toISOString(),
    };
  }

  sanitizeSensitiveData(content) {
    if (!content || typeof content !== 'string') return '';

    let out = content;
    out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]');
    out = out.replace(/\b(?:sk|pk|ghp)_[A-Za-z0-9]{10,}\b/g, '[TOKEN]');
    out = out.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, 'Bearer [TOKEN]');
    out = out.replace(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, '[IP]');
    return out;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
