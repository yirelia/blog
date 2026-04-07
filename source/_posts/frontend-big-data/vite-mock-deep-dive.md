---
title: 深入 Vite Mock 系统：从插件原理到生产级实践
date: 2026-04-05 23:30:00
tags: [vite, mock, vue3, typescript]
category: 前端工程化
---

# 深入 Vite Mock 系统：从插件原理到生产级实践

> 本文从 Vite 插件机制的底层原理出发，逐步构建一个零依赖、生产级的 Mock 服务器插件。涵盖 Vite Dev Server 中间件、Proxy Bypass 机制、JSON 热更新、baseURL 前缀剥离等核心知识点，并附完整可运行的 Demo。

## 一、为什么需要 Mock？

前后端并行开发是现代 Web 项目的常态。后端 API 未就绪时，前端有三种策略：

| 策略 | 优点 | 缺点 |
|------|------|------|
| 代码内 `if/else` 硬编码假数据 | 简单直接 | 侵入业务代码，容易遗留到生产 |
| 第三方 Mock 平台（Apifox/Yapi） | 团队协作友好 | 需要网络，本地开发依赖外部服务 |
| **Dev Server 层拦截** | 零侵入、离线可用、与真实请求链路一致 | 需要自建插件 |

第三种方案是最理想的：Mock 逻辑运行在 Vite Dev Server 的 Node 进程中，不修改任何业务代码，不进入打包产物，环境变量一关就切回真实后端。

本文要实现的就是这种方案。

---

## 二、Vite 插件机制速览

在动手写 Mock 插件之前，需要理解 Vite 插件的三个关键生命周期钩子。

### 2.1 Vite 插件的本质

Vite 插件是一个返回特定结构对象的函数，兼容 Rollup 插件接口并扩展了若干 Vite 专有钩子：

```typescript
import type { Plugin } from 'vite';

function myPlugin(): Plugin {
  return {
    name: 'my-plugin',  // 必须，唯一标识

    // ① Rollup 通用钩子（构建时、开发时都会执行）
    // resolveId, load, transform ...

    // ② Vite 专有钩子（仅开发/构建特定阶段执行）
    config()           {},  // 修改 Vite 配置
    configResolved()   {},  // 配置确认后
    configureServer()  {},  // 操作 dev server
    transformIndexHtml(){},  // 修改 HTML
  };
}
```

### 2.2 与 Mock 相关的三个钩子

```
Vite 启动流程
    │
    ▼
┌─────────────────────────────────┐
│ config(config)                  │  ← ① 修改配置（注入 proxy bypass）
│ 可以读取和修改原始 Vite 配置      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ configResolved(resolvedConfig)  │  ← 配置冻结，只读
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ configureServer(server)         │  ← ② 注册中间件（拦截请求）
│ server.middlewares.use(fn)      │
└──────────┬──────────────────────┘
           │
           ▼
    Dev Server 启动
```

**config()** -- 在配置合并前调用，可以修改 proxy 规则。我们用它给现有 proxy 注入 `bypass` 函数。

**configureServer()** -- 拿到 `ViteDevServer` 实例，通过 `server.middlewares.use()` 注册 Connect 中间件。这是 Mock 拦截的核心入口。

---

## 三、Vite Dev Server 请求链路

理解请求在 Dev Server 内部的流转顺序，是写 Mock 插件的前提。

```
浏览器发起请求 GET /api-cosim/admin-api/system/tenant/list
    │
    ▼
┌──────────────────────────────────────────────┐
│ Vite Dev Server (基于 Connect)               │
│                                              │
│  1. 内置中间件（静态资源、HMR websocket）      │
│       │                                      │
│  2. 用户中间件（configureServer 注册的）       │
│       │  ← Mock 插件在这里拦截                │
│       │  如果匹配 → 直接返回 JSON，结束        │
│       │  如果不匹配 → next()                  │
│       │                                      │
│  3. Vite Proxy（http-proxy-middleware）       │
│       │  ← 如果 bypass 返回值，跳过代理        │
│       │  否则转发到 target 后端                │
│       │                                      │
│  4. Vite 模块转换（.vue, .ts → JS）          │
│       │                                      │
│  5. 404 兜底                                 │
└──────────────────────────────────────────────┘
```

**关键认知**：Vite Proxy（`http-proxy-middleware`）在中间件链中的优先级 **高于** `configureServer` 注册的用户中间件。也就是说，如果 proxy 规则匹配了请求路径，请求会被直接转发到后端，根本不会到达 Mock 中间件。

这就是为什么仅靠 `configureServer` 注册中间件是不够的 -- 我们还需要在 `config()` 钩子中给 proxy 规则注入 `bypass`，让匹配 Mock 的请求跳过代理。

---

## 四、Proxy Bypass 机制详解

### 4.1 什么是 bypass？

Vite 的 proxy 配置底层使用 `http-proxy-middleware`，它支持一个 `bypass` 函数：

```typescript
// vite.config.ts
server: {
  proxy: {
    '^/api-*': {
      target: 'http://backend:8001',
      changeOrigin: true,
      // bypass: 如果返回字符串，跳过代理，当作本地路径处理
      // bypass: 如果返回 false/undefined，正常代理
      bypass(req, res, proxyOptions) {
        if (shouldMock(req.url)) {
          return req.url;  // 返回字符串 → 跳过代理
        }
        // 返回 undefined → 正常代理到 target
      }
    }
  }
}
```

### 4.2 bypass 的执行时机

```
请求进入 proxy 中间件
    │
    ▼
  有 bypass 函数？ ──否──→ 直接代理到 target
    │
    是
    ▼
  执行 bypass(req, res, options)
    │
    ├─ 返回 string → 跳过代理，请求继续传递给下一个中间件
    ├─ 返回 false  → 返回 404
    └─ 返回 undefined → 正常代理到 target
```

返回 `req.url`（字符串）的效果是：这个请求不走代理，而是继续沿着 Connect 中间件链往下传递。这样我们的 Mock 中间件就有机会拦截它了。

### 4.3 为什么不直接把 Mock 中间件放在 proxy 前面？

`configureServer` 注册的中间件默认插在 Vite 内部中间件 **之后**。虽然可以通过返回一个函数来实现"后置"中间件，但 proxy 的位置是由 Vite 内部控制的，不容易精确插队。

用 `bypass` 是最稳妥的方案：在 proxy 决策阶段就告诉它"这个请求不用你管"。

---

## 五、从零实现 Mock 插件

### 5.1 整体架构

```
createMockPlugin(options)
    │
    ├── config() 钩子
    │     ├── 加载所有 Mock 条目（JSON + TS）
    │     ├── 收集 mock URL 集合
    │     └── 给每条 proxy 规则注入 bypass
    │
    └── configureServer() 钩子
          ├── 加载 JSON Mock 数据
          ├── 启动文件监听（热更新）
          └── 注册 Connect 中间件
                ├── 解析请求（URL、method、query、body、headers）
                ├── 匹配 Mock 条目（剥离 baseURL 前缀）
                ├── 模拟延迟
                └── 返回 JSON 响应
```

### 5.2 类型定义

先定义核心类型，这是整个系统的契约：

```typescript
// ── 基础类型 ──

type MockMethod = 'get' | 'post' | 'put' | 'delete';

/** handler 接收的请求信息 */
interface MockRequestOptions {
  query: Record<string, string>;    // URL ?key=value
  body: unknown;                    // POST/PUT 请求体
  headers: Record<string, string>;  // 请求头
}

/** 响应体，与后端 RESP<T> 对齐 */
interface MockResponse<T = unknown> {
  code: number;       // 业务状态码（0=成功，401=未授权，503=不可用...）
  data: T | null;     // 业务数据，错误时为 null
  msg: string;        // 消息
  message: string;    // 消息（兼容字段）
}

// ── 两种数据源 ──

/** JSON 文件格式 */
interface MockJsonFile {
  url: string;
  method: MockMethod;
  timeout?: number;
  response: MockResponse;
}

/** TS handler 定义（支持条件逻辑） */
interface MockHandler {
  url: string;
  method: MockMethod;
  timeout?: number;
  handler: (options: MockRequestOptions) => MockResponse;
}

/** 内部统一条目 */
interface MockEntry {
  url: string;
  method: MockMethod;
  timeout: number;
  resolve: (options: MockRequestOptions) => MockResponse;
}
```

**设计要点**：

- `MockJsonFile` 和 `MockHandler` 是两种外部输入格式
- `MockEntry` 是内部统一的处理格式，两种来源都转换成它
- `MockResponse` 的 `data` 类型是 `T | null`，比后端的 `RESP<T>` 更真实（错误时后端确实返回 `null`）

### 5.3 响应工具函数

给 TS handler 提供便捷的响应构造函数：

```typescript
function resultSuccess<T>(data: T, msg = 'success'): MockResponse<T> {
  return { code: 0, data, msg, message: msg };
}

function resultError(msg: string, code = 500): MockResponse<null> {
  return { code, data: null, msg, message: msg };
}

function resultPageSuccess<T>(
  list: T[],
  options: { page?: number; size?: number; total?: number }
): MockResponse<{
  list: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  numberOfElements: number;
}> {
  const page = options.page ?? 1;
  const size = options.size ?? 10;
  const total = options.total ?? list.length;
  return resultSuccess({
    list,
    number: page,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
    numberOfElements: list.length
  });
}
```

为什么需要 `resultPageSuccess`？因为后端分页接口有固定结构（`list + number + size + totalElements + totalPages`），每次手写容易遗漏字段。

### 5.4 JSON 自动扫描

这是 Mock 系统的核心能力之一：扫描 `mock/data/` 目录下所有 `.json` 文件，自动注册为 Mock 接口。

```typescript
import { readdirSync, readFileSync, lstatSync } from 'fs';
import { join } from 'path';

/** 递归收集目录下所有 .json 文件路径 */
function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = lstatSync(fullPath);  // 注意：lstatSync 不跟随 symlink
      if (stat.isSymbolicLink()) continue;  // 安全：跳过符号链接
      if (stat.isDirectory()) {
        results.push(...collectJsonFiles(fullPath));  // 递归子目录
      } else if (entry.endsWith('.json')) {
        results.push(fullPath);
      }
    }
  } catch {
    // data 目录不存在时静默跳过
  }
  return results;
}
```

**安全措施**：使用 `lstatSync` 而非 `statSync`。区别在于 `lstatSync` 不跟随符号链接，可以检测到 symlink 并跳过，防止路径穿越攻击（比如有人创建了一个 symlink 指向 `/etc/passwd`）。

### 5.5 JSON 文件加载与校验

每个 JSON 文件加载后需要严格校验：

```typescript
const VALID_METHODS = new Set<string>(['get', 'post', 'put', 'delete']);

function loadJsonMock(filePath: string): MockEntry | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const json: MockJsonFile = JSON.parse(raw);

    // 校验 1：必填字段
    if (!json.url || !json.method || !json.response) {
      console.warn(`[mock] 跳过格式不完整的文件: ${filePath}`);
      return null;
    }

    // 校验 2：method 白名单
    const method = json.method.toLowerCase();
    if (!VALID_METHODS.has(method)) {
      console.warn(`[mock] 无效的 method "${json.method}": ${filePath}`);
      return null;
    }

    // 校验 3：response 结构
    if (json.response.code === undefined || json.response.msg === undefined) {
      console.warn(`[mock] response 缺少 code/msg 字段: ${filePath}`);
      return null;
    }

    // 转换为统一的 MockEntry
    return {
      url: json.url,
      method: method as MockMethod,
      timeout: json.timeout ?? 200,
      resolve: () => json.response   // JSON 是静态数据，resolve 直接返回
    };
  } catch (e) {
    console.warn(`[mock] JSON 解析失败: ${filePath}`, e);
    return null;
  }
}
```

**设计哲学**：宽进严出。文件扫描不报错（目录不存在就跳过），但文件内容必须严格校验。不合格的文件跳过并输出明确的警告信息，方便开发者排查。

### 5.6 请求解析

Connect 中间件接收的是 Node.js 原生的 `IncomingMessage`，需要手动解析：

```typescript
import type { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

/** 解析请求体（POST/PUT） */
function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) { resolve({}); return; }
      try {
        resolve(JSON.parse(raw));    // 尝试 JSON 解析
      } catch {
        resolve(raw);                // 非 JSON 返回原始字符串
      }
    });
    req.on('error', () => resolve({}));  // 出错不崩溃
  });
}

/** 解析完整请求信息 */
function parseMockRequest(req: IncomingMessage): Promise<MockRequestOptions> {
  const parsed = parseUrl(req.url ?? '', true);

  // 解析 query 参数
  const query: Record<string, string> = {};
  for (const [key, val] of Object.entries(parsed.query)) {
    if (typeof val === 'string') {
      query[key] = val;
    } else if (Array.isArray(val) && val.length > 0) {
      query[key] = val[0] ?? '';     // 数组参数取第一个
    }
  }

  // 解析 headers
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === 'string') {
      headers[key] = val;            // 只保留 string 类型
    }
  }

  return parseRequestBody(req).then(body => ({ query, body, headers }));
}
```

为什么要手动解析而不用 `body-parser`？因为 Mock 插件追求零依赖。Vite 插件运行在 Node 端，引入额外的 npm 包会增加安装体积。Node 原生 API 完全够用。

### 5.7 URL 匹配与 baseURL 剥离

这是最容易踩坑的地方。在实际项目中，axios 通常配置了 `baseURL`：

```typescript
// cloud/src/utils/http.ts
const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_URL,  // '/api-cosim'
});
```

这意味着所有 API 请求都会被加上前缀：

```
代码中调用：http.get('/admin-api/system/tenant/list')
实际发出请求：GET /api-cosim/admin-api/system/tenant/list
```

但 Mock JSON 文件中注册的 URL 是不带前缀的：

```json
{ "url": "/admin-api/system/tenant/list", "method": "get", ... }
```

如果直接用请求路径去匹配，永远匹配不上。解决方案是在匹配前剥离 baseURL 前缀：

```typescript
function matchMock(
  entries: MockEntry[],
  method: string,
  pathname: string,
  baseURL = ''
): MockEntry | undefined {
  const lowerMethod = method.toLowerCase();
  // 核心：剥离 baseURL 前缀
  const stripped = baseURL && pathname.startsWith(baseURL)
    ? pathname.slice(baseURL.length)
    : pathname;
  return entries.find(
    item => item.method === lowerMethod && item.url === stripped
  );
}
```

同样的逻辑也要应用在 proxy bypass 中：

```typescript
bypass: (req) => {
  const pathname = req.url?.split('?')[0] ?? '';
  const stripped = baseURL && pathname.startsWith(baseURL)
    ? pathname.slice(baseURL.length)
    : pathname;
  if (mockUrls.has(stripped)) {
    return req.url;  // 跳过代理
  }
}
```

**完整的请求匹配流程**：

```
浏览器请求：GET /api-cosim/admin-api/system/tenant/list
        │
        ▼
  Proxy 拦截（匹配 '^/api-*'）
        │
        ▼
  执行 bypass(req)
        │ pathname = '/api-cosim/admin-api/system/tenant/list'
        │ stripped = '/admin-api/system/tenant/list'  (剥离 /api-cosim)
        │ mockUrls.has(stripped) → true
        │
        ▼
  返回 req.url → 跳过代理
        │
        ▼
  Mock 中间件拦截
        │ matchMock(entries, 'GET', pathname, '/api-cosim')
        │ stripped = '/admin-api/system/tenant/list'
        │ → 匹配成功
        │
        ▼
  返回 Mock JSON 响应
```

### 5.8 完整插件实现

把前面所有部分组装起来：

```typescript
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { existsSync, watch } from 'fs';
import { join, resolve } from 'path';

interface CreateMockOptions {
  handlers?: MockHandler[];
  baseURL?: string;
}

function createMockPlugin(options: CreateMockOptions = {}): Plugin {
  const mockDir = resolve(__dirname);
  const dataDir = join(mockDir, 'data');
  const baseURL = options.baseURL ?? '';

  // TS handlers → MockEntry（优先级高于 JSON）
  const handlerEntries = (options.handlers ?? []).map(handlerToEntry);

  // JSON entries（可热更新）
  let jsonEntries: MockEntry[] = [];

  function reloadJsonMocks(): void {
    jsonEntries = loadAllJsonMocks(dataDir);
    console.log(`[mock] 已加载 ${jsonEntries.length} 个 JSON mock`);
  }

  function getAllEntries(): MockEntry[] {
    // TS handler 优先：相同 url+method 时覆盖 JSON
    const merged = new Map<string, MockEntry>();
    for (const entry of jsonEntries) {
      merged.set(`${entry.method}:${entry.url}`, entry);
    }
    for (const entry of handlerEntries) {
      merged.set(`${entry.method}:${entry.url}`, entry);
    }
    return Array.from(merged.values());
  }

  return {
    name: 'vite-plugin-mock-server',

    // ① config 钩子：注入 proxy bypass
    config(config) {
      reloadJsonMocks();
      const mockUrls = new Set<string>();
      for (const e of getAllEntries()) mockUrls.add(e.url);

      const proxy = config.server?.proxy;
      if (proxy && typeof proxy === 'object') {
        for (const key of Object.keys(proxy)) {
          const rule = proxy[key];
          if (typeof rule === 'object' && rule !== null) {
            (rule as Record<string, unknown>).bypass = (
              req: { url?: string }
            ) => {
              const pathname = req.url?.split('?')[0] ?? '';
              const stripped = baseURL && pathname.startsWith(baseURL)
                ? pathname.slice(baseURL.length)
                : pathname;
              if (mockUrls.has(stripped)) {
                return req.url;
              }
            };
          }
        }
      }
    },

    // ② configureServer 钩子：注册中间件
    configureServer(server: ViteDevServer) {
      reloadJsonMocks();

      // 文件监听：JSON 热更新
      if (existsSync(dataDir)) {
        try {
          watch(dataDir, { recursive: true }, (_event, filename) => {
            if (filename?.endsWith('.json')) {
              console.log(`[mock] 检测到变化: ${filename}，重新加载...`);
              reloadJsonMocks();
            }
          });
        } catch {
          console.warn('[mock] 文件监听失败，JSON 修改后需重启');
        }
      }

      // 注册 Connect 中间件
      server.middlewares.use(
        async (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void
        ) => {
          const parsed = parseUrl(req.url ?? '', false);
          const pathname = parsed.pathname ?? '';
          const method = req.method ?? 'GET';

          const entries = getAllEntries();
          const matched = matchMock(entries, method, pathname, baseURL);
          if (!matched) {
            next();  // 不匹配，交给下一个中间件
            return;
          }

          try {
            const options = await parseMockRequest(req);

            // 模拟网络延迟
            if (matched.timeout > 0) {
              await delay(matched.timeout);
            }

            const mockResponse = matched.resolve(options);

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(mockResponse));

            console.log(
              `[mock] ${method} ${pathname} → code: ${mockResponse.code}`
            );
          } catch (e) {
            // handler 异常兜底，不崩溃 dev server
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({
              code: 500,
              data: null,
              msg: `Mock handler error: ${
                e instanceof Error ? e.message : 'unknown'
              }`,
              message: 'mock handler error'
            }));
          }
        }
      );

      const total = handlerEntries.length + jsonEntries.length;
      console.log(`\n  Mock server enabled (${total} routes)\n`);
    }
  };
}
```

---

## 六、JSON 热更新原理

### 6.1 fs.watch 的工作方式

```typescript
watch(dataDir, { recursive: true }, (_event, filename) => {
  if (filename?.endsWith('.json')) {
    reloadJsonMocks();
  }
});
```

`fs.watch` 是 Node.js 提供的文件系统监听 API，底层使用操作系统的原生机制：

| 平台 | 底层机制 | recursive 支持 |
|------|----------|---------------|
| macOS | FSEvents | 原生支持 |
| Linux | inotify | Node 16+ 支持 |
| Windows | ReadDirectoryChangesW | 原生支持 |

### 6.2 为什么 JSON 能热更新但 TS 不能？

```
JSON 文件
    │
    ▼
  fs.watch 检测到变化
    │
    ▼
  reloadJsonMocks()
    │ 重新读取 & 解析所有 JSON 文件
    │ 替换 jsonEntries 数组
    │
    ▼
  下一次请求使用新数据 ✓


TS Handler 文件
    │
    ▼
  Vite 启动时通过 import 加载
    │
    ▼
  Node.js require 缓存了模块
    │
    ▼
  文件修改后缓存不会自动失效
    │
    ▼
  必须重启 dev server ✗
```

JSON 文件每次用 `readFileSync` 读取，没有缓存问题。而 TS 文件是在 Vite 启动时通过 `import` 加载的，Node.js 的模块系统会缓存 `require()` 的结果。要实现 TS handler 热更新，需要手动清除 `require.cache`，这会引入复杂性和潜在的内存泄漏，不值得。

### 6.3 热更新的终端反馈

```
[mock] 检测到文件变化: login/tenant-list.json，重新加载...
[mock] 已加载 9 个 JSON mock
```

修改 JSON 文件后 2-3 秒内生效，无需刷新浏览器（下一次 API 请求就会使用新数据）。

---

## 七、双数据源合并策略

### 7.1 JSON vs TS Handler 的定位

| 维度 | JSON 文件 | TS Handler |
|------|-----------|------------|
| 适用场景 | 固定数据返回 | 需要条件逻辑 |
| 修改生效 | 即时（热更新） | 需重启 dev server |
| 技术门槛 | 零门槛，粘贴 API 响应即可 | 需要写 TypeScript |
| 文件位置 | `mock/data/<业务域>/` | `mock/modules/<模块>.mock.ts` |
| 注册方式 | 自动扫描，无需注册 | 需在 vite.config.ts 注册 |

### 7.2 合并与优先级

```typescript
function getAllEntries(): MockEntry[] {
  const merged = new Map<string, MockEntry>();

  // 先放 JSON
  for (const entry of jsonEntries) {
    merged.set(`${entry.method}:${entry.url}`, entry);
  }

  // 再放 TS（同 key 覆盖 JSON）
  for (const entry of handlerEntries) {
    merged.set(`${entry.method}:${entry.url}`, entry);
  }

  return Array.from(merged.values());
}
```

使用 `Map` 以 `method:url` 为 key 做去重。后放的 TS handler 会覆盖先放的 JSON。这意味着：

1. 大部分接口用 JSON（简单、热更新）
2. 少数需要条件逻辑的接口用 TS handler 覆盖
3. 两者可以共存，不冲突

**实际例子**：`get-permission-info` 接口在 JSON 和 TS 中都有定义。JSON 提供完整的权限数据，TS handler 在此基础上增加了 token 过期的 401 判断：

```typescript
// login.mock.ts — TS handler 覆盖 JSON
{
  url: '/admin-api/system/auth/get-permission-info',
  method: 'get',
  handler: (options: MockRequestOptions) => {
    const auth = options.headers.authorization ?? '';
    // 特殊 token → 模拟 401
    if (auth === 'Bearer expired-token') {
      return resultError('令牌已过期', 401);
    }
    // 正常情况 → 从 JSON 文件加载完整数据
    return resultSuccess(loadJsonData('get-permission-info.json'));
  }
}
```

---

## 八、与 axios 拦截器的协作

Mock 返回的数据最终要经过 axios 拦截器处理，理解这个链路很重要。

### 8.1 请求链路全景

```
Vue 组件调用 API
    │
    ▼
api/login.ts:  http.get('/admin-api/system/tenant/list')
    │
    ▼
axios request interceptor
    │ 添加 Authorization、Tenant-Id headers
    │
    ▼
axios 发出请求:  GET /api-cosim/admin-api/system/tenant/list
    │                    ↑ baseURL 自动拼接
    ▼
Vite Dev Server 接收
    │
    ▼
Proxy bypass → Mock 中间件拦截
    │ 剥离 /api-cosim 前缀
    │ 匹配 /admin-api/system/tenant/list
    │
    ▼
返回 HTTP 200 + JSON body:
  { "code": 0, "data": [...], "msg": "success", "message": "success" }
    │
    ▼
axios response interceptor
    │ HTTP 200 → 进入成功分支
    │ response.data.code === 0 → 正常
    │ return response.data
    │
    ▼
Vue 组件拿到:  { code: 0, data: [...], msg: "success", message: "success" }
```

### 8.2 Mock 如何触发错误路径

Mock **始终返回 HTTP 200**，通过 `response.data.code` 触发不同的业务逻辑：

```
Mock 返回 code: 401
    │
    ▼
axios response interceptor
    │ isHttp200(response.status) → true
    │ isHttp401(response.data.code) → true
    │
    ▼
触发 Token 刷新流程
    │ TokenInstance.startRequestToken()
    │ TokenInstance.refreshToken()
    │ ...
```

```
Mock 返回 code: 503
    │
    ▼
axios response interceptor
    │ response.data.code === 503
    │
    ▼
throw AppError({
  code: ErrorCode.SERVICE_UNAVAILABLE,
  userMessage: '服务不可用，请稍后再试'
})
```

这就是为什么 Mock 系统能完整模拟各种业务场景 -- 它不是绕过了 axios 拦截器，而是提供了正确格式的数据让拦截器按预期运行。

---

## 九、完整 Demo：从零搭建

### 9.1 项目结构

```
my-vite-mock-demo/
├── package.json
├── vite.config.ts
├── .env.development        # 正常模式
├── .env.mock               # Mock 模式
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── api/
│   │   └── user.ts         # API 定义
│   └── utils/
│       └── http.ts         # axios 实例
└── mock/
    ├── mock-plugin.ts       # 插件核心
    ├── data/
    │   └── user/
    │       ├── user-list.json
    │       └── user-detail.json
    └── modules/
        └── user.mock.ts     # 条件逻辑 handler
```

### 9.2 环境配置

```bash
# .env.development
VITE_APP_BASE_URL='/api'
VITE_MOCK=false

# .env.mock
VITE_APP_BASE_URL='/api'
VITE_MOCK=true
VITE_HTML_TITLE='Demo [Mock Mode]'
```

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "dev:mock": "vite --mode mock"
  }
}
```

### 9.3 Vite 配置

```typescript
// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createMockPlugin } from './mock/mock-plugin';
import userHandlers from './mock/modules/user.mock';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const isMock = env.VITE_MOCK === 'true';

  return {
    plugins: [
      vue(),
      isMock && createMockPlugin({
        handlers: userHandlers,
        baseURL: env.VITE_APP_BASE_URL  // '/api'
      })
    ],
    server: {
      port: 3000,
      proxy: {
        '^/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, '')
        }
      }
    }
  };
});
```

### 9.4 axios 实例

```typescript
// src/utils/http.ts
import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_URL,  // '/api'
  timeout: 10000
});

http.interceptors.response.use(
  response => {
    const { code, data, msg } = response.data;
    if (code === 0) return response.data;
    return Promise.reject(new Error(msg || '请求失败'));
  },
  error => Promise.reject(error)
);

export default http;
```

### 9.5 API 定义

```typescript
// src/api/user.ts
import http from '@/utils/http';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserListResponse {
  list: User[];
  total: number;
}

export function getUserList(page = 1, size = 10) {
  return http.get<unknown, { code: number; data: UserListResponse }>(
    '/user/list',
    { params: { page, size } }
  );
}

export function getUserDetail(id: string) {
  return http.get<unknown, { code: number; data: User }>(
    `/user/detail`,
    { params: { id } }
  );
}

export function createUser(data: Omit<User, 'id'>) {
  return http.post('/user/create', data);
}
```

### 9.6 JSON Mock 数据

```json
// mock/data/user/user-list.json
{
  "url": "/user/list",
  "method": "get",
  "timeout": 150,
  "response": {
    "code": 0,
    "data": {
      "list": [
        { "id": "1", "name": "张三", "email": "zhangsan@example.com", "role": "admin" },
        { "id": "2", "name": "李四", "email": "lisi@example.com", "role": "user" },
        { "id": "3", "name": "王五", "email": "wangwu@example.com", "role": "user" }
      ],
      "total": 3
    },
    "msg": "success",
    "message": "success"
  }
}
```

```json
// mock/data/user/user-detail.json
{
  "url": "/user/detail",
  "method": "get",
  "timeout": 100,
  "response": {
    "code": 0,
    "data": {
      "id": "1",
      "name": "张三",
      "email": "zhangsan@example.com",
      "role": "admin"
    },
    "msg": "success",
    "message": "success"
  }
}
```

### 9.7 TS Handler（条件逻辑）

```typescript
// mock/modules/user.mock.ts
import { resultSuccess, resultError } from '../mock-plugin';
import type { MockHandler, MockRequestOptions } from '../mock-plugin';

const userHandlers: MockHandler[] = [
  // 创建用户 — 根据参数返回不同结果
  {
    url: '/user/create',
    method: 'post',
    timeout: 200,
    handler: (options: MockRequestOptions) => {
      const body = options.body as Record<string, unknown>;

      // 校验必填字段
      if (!body?.name || !body?.email) {
        return resultError('姓名和邮箱不能为空', 400);
      }

      // 模拟邮箱重复
      if (body.email === 'duplicate@example.com') {
        return resultError('该邮箱已被注册', 409);
      }

      // 成功
      return resultSuccess({
        id: 'new-' + Date.now(),
        name: body.name,
        email: body.email,
        role: body.role ?? 'user'
      });
    }
  }
];

export default userHandlers;
```

### 9.8 Vue 组件使用

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getUserList, createUser } from './api/user';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const users = ref<User[]>([]);
const loading = ref(false);
const message = ref('');

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await getUserList();
    users.value = res.data.list;
  } catch (e) {
    message.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  try {
    await createUser({ name: '新用户', email: 'new@example.com', role: 'user' });
    message.value = '创建成功';
    await fetchUsers();
  } catch (e) {
    message.value = e instanceof Error ? e.message : '创建失败';
  }
}

async function handleDuplicate() {
  try {
    await createUser({
      name: '测试',
      email: 'duplicate@example.com',
      role: 'user'
    });
  } catch (e) {
    message.value = e instanceof Error ? e.message : '创建失败';
  }
}

onMounted(fetchUsers);
</script>

<template>
  <div style="padding: 24px; max-width: 600px; margin: 0 auto">
    <h1>Vite Mock Demo</h1>
    <p v-if="message" style="color: #e65100">{{ message }}</p>

    <div style="margin-bottom: 16px">
      <button @click="fetchUsers">刷新列表</button>
      <button @click="handleCreate" style="margin-left: 8px">创建用户（成功）</button>
      <button @click="handleDuplicate" style="margin-left: 8px">创建用户（邮箱重复）</button>
    </div>

    <p v-if="loading">加载中...</p>
    <table v-else border="1" cellpadding="8" style="border-collapse: collapse; width: 100%">
      <thead>
        <tr><th>ID</th><th>姓名</th><th>邮箱</th><th>角色</th></tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.id }}</td>
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td>{{ user.role }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

### 9.9 启动验证

```bash
# 启动 Mock 模式
pnpm dev:mock

# 终端输出
[mock] 已加载 2 个 JSON mock

  Mock server enabled (2 JSON + 1 handlers = 3 routes)

# 请求日志
[mock] GET /api/user/list → code: 0
[mock] POST /api/user/create → code: 0
[mock] POST /api/user/create → code: 409
```

---

## 十、异常兜底设计

### 10.1 Handler 异常不崩 Dev Server

TS handler 是开发者写的代码，可能有 bug。插件必须兜住：

```typescript
try {
  const mockResponse = matched.resolve(options);
  res.end(JSON.stringify(mockResponse));
} catch (e) {
  // 兜底：返回 500，不崩溃
  console.error(`[mock] handler 执行异常: ${method} ${pathname}`, e);
  res.end(JSON.stringify({
    code: 500,
    data: null,
    msg: `Mock handler error: ${e instanceof Error ? e.message : 'unknown'}`,
    message: 'mock handler error'
  }));
}
```

### 10.2 文件监听失败不影响运行

```typescript
if (existsSync(dataDir)) {
  try {
    watch(dataDir, { recursive: true }, callback);
  } catch {
    // 监听失败只是降级为"需手动重启"，不影响 mock 功能
    console.warn('[mock] 文件监听启动失败，JSON 修改后需手动重启');
  }
} else {
  console.warn(`[mock] data 目录不存在: ${dataDir}，跳过文件监听`);
}
```

### 10.3 JSON 解析失败不阻塞其他文件

```typescript
function loadJsonMock(filePath: string): MockEntry | null {
  try {
    // ... 解析和校验
  } catch (e) {
    console.warn(`[mock] JSON 解析失败: ${filePath}`, e);
    return null;  // 返回 null，外层 filter 掉
  }
}
```

**设计原则**：一个文件出错不影响其他文件。9 个 JSON 文件中有 1 个格式错误，其他 8 个照常工作。

---

## 十一、生产安全保证

### 11.1 零构建产物污染

```
Mock 插件只使用了两个 Vite 钩子：
  - config()           → 仅开发时执行
  - configureServer()  → 仅开发服务器存在时执行

构建时（vite build）：
  - 没有 dev server → configureServer 不执行
  - config() 虽然执行但只修改 proxy → 构建不走 proxy
  - mock/ 目录不在 src/ 内 → 不会被 Rollup 扫描
```

### 11.2 条件加载

```typescript
// vite.config.ts
isMock && createMockPlugin({ ... })
```

`isMock` 为 `false` 时整个插件不会被创建，plugins 数组中放的是 `false`，Vite 会自动过滤掉 falsy 值。

### 11.3 环境变量隔离

```
.env.development   VITE_MOCK 未定义  → isMock = false
.env.mock          VITE_MOCK=true    → isMock = true
.env.production    VITE_MOCK 未定义  → isMock = false
```

生产构建时 `loadEnv('production', ...)` 读取 `.env.production`，没有 `VITE_MOCK`，插件不会加载。

---

## 十二、排障指南

### 常见问题 1：接口没有被 Mock 拦截

**排查步骤**：

```bash
# 1. 确认 mock 模式启动
#    终端应该有 "Mock server enabled" 输出

# 2. 检查请求的完整 URL
#    打开浏览器 DevTools → Network → 看实际请求路径
#    例如：/api-cosim/admin-api/system/tenant/list

# 3. 对比 mock 注册的 URL
#    JSON 文件中的 url 字段是否匹配？
#    是否忘记了 baseURL 前缀的问题？

# 4. 检查终端有没有 JSON 加载警告
#    [mock] 跳过格式不完整的文件: ...
#    [mock] 无效的 method: ...
```

**最常见的原因**：
- 没有传 `baseURL` 给 `createMockPlugin()`
- JSON 文件中 `method` 大小写不匹配
- JSON 文件缺少 `response.code` 或 `response.msg`

### 常见问题 2：proxy 报错 ETIMEDOUT

```
ERROR [vite] http proxy error: /api-cosim/admin-api/...
Error: connect ETIMEDOUT 192.168.x.x:8001
```

这说明请求没有被 Mock 拦截，穿透到了 proxy 去连真实后端。原因是 bypass 没有生效。检查：

1. `createMockPlugin` 的 `baseURL` 参数是否正确
2. proxy 规则的 key 是否覆盖了你的请求路径

### 常见问题 3：JSON 修改后不生效

```bash
# 检查终端是否有热更新日志
# [mock] 检测到文件变化: xxx.json，重新加载...

# 如果没有，可能是：
# 1. 文件不在 mock/data/ 目录下
# 2. fs.watch 启动失败（检查启动时是否有警告）
# 3. 文件扩展名不是 .json
```

---

## 十三、与第三方 Mock 方案对比

| 维度 | 自建 Vite 插件 | vite-plugin-mock | Mock Service Worker | Apifox Mock |
|------|---------------|------------------|--------------------|----|
| 依赖 | 零依赖 | mockjs + 插件 | msw 包 | 需要网络 |
| 运行层 | Vite Dev Server | Vite Dev Server | Service Worker (浏览器) | 云端 |
| 侵入性 | 零 | 零 | 需要注册 SW | 零 |
| JSON 热更新 | 支持 | 不支持 | 不适用 | 不适用 |
| 条件逻辑 | TS Handler | TS Handler | JS Handler | 有限支持 |
| 浏览器 Network | 显示为 HTTP 200 | 显示为 HTTP 200 | 显示为 mock 标记 | 正常显示 |
| 离线可用 | 是 | 是 | 是 | 否 |
| 构建产物 | 不进入 | 不进入 | SW 文件进入 | 不适用 |
| proxy 兼容 | bypass 方案 | 类似 | 不涉及 | 不涉及 |

自建方案的核心优势：**零依赖 + JSON 热更新 + 完全控制**。在项目特定的 `RESP<T>` 响应格式、baseURL 前缀处理这些场景下，自建方案比通用库更贴合。

---

## 十四、最佳实践总结

### 文件组织

```
mock/data/ 按业务域划分子目录：
  login/    → 认证相关
  user/     → 用户管理
  scene/    → 场景管理
  ...

文件命名：<资源>-<操作>.json
  user-list.json
  user-detail.json
  scene-checkout.json
```

### 数据来源

```
1. 从 Swagger/Apifox 复制 → 包裹为 JSON 文件
2. 从浏览器 Network 复制 → 包裹为 JSON 文件
3. 需要条件逻辑 → 写 TS handler，JSON 提供基础数据
```

### 开发流程

```
1. 拿到接口文档
2. 创建 JSON mock 文件
3. pnpm dev:mock 启动
4. 前端页面对接 API
5. 后端就绪后切回 pnpm dev
6. 联调验证
```

### 需要记住的规则

1. **所有 Mock 响应 HTTP 状态码都是 200**，业务状态用 `response.code` 区分
2. **JSON 文件改了即时生效**，TS handler 改了要重启
3. **TS handler 优先级高于 JSON**，同 url+method 会覆盖
4. **mock/ 目录不在 src/ 内**，不会被打包进生产产物
5. **baseURL 要传对**，否则请求会穿透到 proxy

---

## 附录 A：完整类型定义速查

```typescript
// ── 方法类型 ──
type MockMethod = 'get' | 'post' | 'put' | 'delete';

// ── 请求信息 ──
interface MockRequestOptions {
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

// ── 响应格式 ──
interface MockResponse<T = unknown> {
  code: number;
  data: T | null;
  msg: string;
  message: string;
}

// ── JSON 文件格式 ──
interface MockJsonFile {
  url: string;
  method: MockMethod;
  timeout?: number;        // 默认 200ms
  response: MockResponse;
}

// ── TS Handler 定义 ──
interface MockHandler {
  url: string;
  method: MockMethod;
  timeout?: number;
  handler: (options: MockRequestOptions) => MockResponse;
}

// ── 插件选项 ──
interface CreateMockOptions {
  handlers?: MockHandler[];
  baseURL?: string;
}
```

## 附录 B：工具函数速查

```typescript
// 成功响应
resultSuccess({ id: '1', name: '张三' })
// → { code: 0, data: { id: '1', name: '张三' }, msg: 'success', message: 'success' }

// 错误响应
resultError('参数错误', 400)
// → { code: 400, data: null, msg: '参数错误', message: '参数错误' }

// 分页响应
resultPageSuccess(list, { page: 1, size: 10, total: 100 })
// → { code: 0, data: { list, number: 1, size: 10, totalElements: 100, totalPages: 10, numberOfElements: list.length } }
```

## 附录 C：环境变量配置模板

```bash
# .env.mock — Mock 模式专用
VITE_APP_BASE_URL='/api-cosim'
VITE_HTML_TITLE='平台 [Mock]'
VITE_DOMAIN='http://192.168.x.x:8001'
VITE_APP_BASE_PATH='/cloud'
VITE_MOCK=true
```

```json
// package.json scripts
{
  "dev": "vite",
  "dev:mock": "vite --mode mock",
  "build": "vite build"
}
```
