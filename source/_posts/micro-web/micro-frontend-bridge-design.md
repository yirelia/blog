---
title: 微前端状态共享：基于 Proxy 的 Bridge 设计与实现
date: 2026-04-16 16:43:21
tags: [micro-frontend, proxy, bridge, vue3, pinia, state-management]
category: 微前端
---

在微前端架构中，基座与子应用之间的状态共享是绕不开的核心问题。直接共享 Store 实例会导致耦合失控，纯事件驱动又引入大量样板代码和时序问题。本文介绍一种基于 `Proxy` 的 Bridge 方案——基座通过只读代理向子应用暴露全局上下文，子应用透明读取、禁止修改，配合 Pinia `$subscribe` 实现自动同步。

文章涵盖：设计动机、Proxy 只读保护与 DeepFreeze 缓存、Store 到 Bridge 的同步链路、子应用接入模式，以及完整可运行的 Demo。

<!-- more -->

## 一、问题背景

一个典型的微前端系统包含一个基座（Shell）和若干子应用。基座负责认证、权限、路由协调等基础能力，子应用承载具体业务。子应用运行时需要读取当前用户信息、Token、权限列表、租户配置等全局状态。

常见方案和各自的痛点：

| 方案 | 做法 | 痛点 |
|------|------|------|
| 直接共享 Pinia Store | 子应用 `import` 基座的 Store | 强耦合、版本锁定、子应用可篡改状态 |
| props 下发 | 基座通过组件 props 逐层传递 | 层级深、类型爆炸、变更需逐层转发 |
| 纯事件驱动 | EventBus 广播所有状态变更 | 无类型、时序问题、子应用需维护本地副本 |
| 全局变量 | `window.globalState = { ... }` | 无保护、任何代码都能改、难以调试来源 |
| localStorage 轮询 | 子应用定时读 localStorage | 延迟高、序列化开销、竞态条件 |

这些方案的共同问题：**没有在"可读"和"可写"之间划出清晰边界**。子应用只需要读取全局状态，但上述方案要么给了写权限，要么牺牲了使用便利性。

Bridge 方案的目标：

1. 子应用通过 `window.$CTX` 直接读取全局状态，零配置、零订阅
2. 写入操作在开发环境抛错、生产环境静默拒绝
3. 基座 Store 变更自动同步到 Bridge，同一事件循环内可见
4. 嵌套对象被递归冻结，防止通过引用绕过只读保护

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Shell (基座)                                                │
│                                                              │
│  ┌────────────┐    $subscribe     ┌──────────────────┐      │
│  │ Pinia      │ ─────────────────→│ Bridge           │      │
│  │ Stores     │   flush: 'sync'   │                  │      │
│  │            │                    │ internal.update()│      │
│  └────────────┘                    │        ↓         │      │
│                                    │ ┌──────────────┐ │      │
│                                    │ │ state (可变)  │ │      │
│                                    │ └──────┬───────┘ │      │
│                                    │        ↓         │      │
│                                    │ ┌──────────────┐ │      │
│                                    │ │ Proxy (只读)  │──→ window.$CTX
│                                    │ └──────────────┘ │      │
│                                    └──────────────────┘      │
├──────────────────────────────────────────────────────────────┤
│  Sub-Apps (子应用)                                            │
│                                                              │
│  const token = window.$CTX.accessToken    ← 直接读取        │
│  const user  = window.$CTX.userInfo       ← 自动冻结        │
│  window.$CTX.accessToken = 'x'            ← DEV 抛错        │
└──────────────────────────────────────────────────────────────┘
```

数据流是严格单向的：**Pinia Store → Bridge internal state → Proxy → 子应用只读访问**。

## 三、Proxy 只读保护机制

Bridge 的核心是一个 `Proxy`，拦截所有 `get`、`set`、`deleteProperty` 操作。

### 3.1 创建只读 Handler

```typescript
// readonly-handler.ts
export function createReadonlyHandler<T extends object>(
  isDev: boolean
): ProxyHandler<T> {
  // 每个 handler 实例独享一份冻结缓存
  const frozenCache = new WeakMap<object, unknown>();

  return {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // 原始类型和函数直接返回
      if (value === null || value === undefined) return value;
      if (typeof value === 'function') return value;
      if (typeof value !== 'object') return value;

      // 对象类型：深度冻结 + 缓存
      const cached = frozenCache.get(value as object);
      if (cached !== undefined) return cached;

      const frozen = deepFreeze(value);
      frozenCache.set(value as object, frozen);
      return frozen;
    },

    set(_target, prop, _value) {
      const msg = `[Bridge] $CTX.${String(prop)} 是只读的，子应用不允许修改`;
      if (isDev) throw new Error(msg);
      console.warn(msg);
      return true; // 生产环境静默忽略
    },

    deleteProperty(_target, prop) {
      const msg = `[Bridge] 不允许删除 $CTX.${String(prop)}`;
      if (isDev) throw new Error(msg);
      console.warn(msg);
      return true;
    },
  };
}
```

三个关键设计：

**拦截 set 和 deleteProperty**：`set` 返回 `true` 而不是 `false`，因为在严格模式下返回 `false` 会直接抛 `TypeError`，无法区分 DEV/PROD 行为。返回 `true` 让 Proxy 认为"操作成功"，但实际上 `target` 没有被修改。

**函数不冻结**：`window.$CTX.util.logout()` 等工具方法需要正常调用，冻结函数会导致运行时异常。

**WeakMap 缓存**：同一个嵌套对象被多次 `get` 时，返回同一份冻结引用，保证 `===` 一致性。当 `internal.update()` 替换了源对象后，旧引用自动被 GC 回收。

### 3.2 DeepFreeze 实现

```typescript
// freeze.ts
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj as Readonly<T>;

  // 跳过类实例（Date、自定义类等）
  const proto = Object.getPrototypeOf(obj);
  if (
    proto !== Object.prototype &&
    proto !== Array.prototype &&
    proto !== null
  ) {
    return obj as Readonly<T>;
  }

  Object.freeze(obj);

  // 递归冻结所有属性
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null) {
      deepFreeze(value);
    }
  }

  return obj as Readonly<T>;
}
```

跳过类实例是一个重要的安全阀。`Date`、`Map`、`Set` 等内置类以及业务中的类实例，其内部状态依赖可变性，冻结会导致方法调用失败：

```typescript
const date = new Date();
Object.freeze(date);
date.setFullYear(2025); // TypeError: Cannot assign to read only property
```

`deepFreeze` 只冻结纯对象 (`Object.prototype`) 和数组 (`Array.prototype`)，这是 Bridge 传递的状态数据的典型形态。

### 3.3 冻结缓存的引用稳定性

```typescript
// 场景：子应用在 computed 中读取用户信息
const userInfo = computed(() => window.$CTX.userInfo);

// 第一次访问：deepFreeze(rawUserInfo) → 缓存到 WeakMap → 返回 frozen
// 第二次访问：命中 WeakMap 缓存 → 返回同一个 frozen 引用
// Vue 的 computed 对比 oldValue === newValue，如果引用相同则不触发更新
```

这意味着：只要基座没有通过 `internal.update()` 替换 `userInfo`，子应用的 `computed` 不会重复计算。一旦替换发生，源对象变了，WeakMap 命中不了旧缓存，返回新的冻结对象，`computed` 检测到引用变化，触发更新。

## 四、Bridge 创建与内部 API

```typescript
// create-bridge.ts
export interface Bridge<T extends object = AppContext> {
  /** 子应用通过此 Proxy 只读访问 */
  proxy: T;
  /** 基座专用，子应用不应接触 */
  internal: BridgeInternal<T>;
}

export interface BridgeInternal<T extends object = AppContext> {
  /** 浅合并：仅替换顶层 key */
  update(partial: Partial<T>): void;
  /** 返回当前状态的浅拷贝（非冻结） */
  getSnapshot(): T;
}

export function createBridge<T extends object>(
  initial: T,
  isDev = false
): Bridge<T> {
  // 1. 内部可变状态
  const state = { ...initial } as Record<string, unknown>;

  // 2. 只读 Proxy
  const handler = createReadonlyHandler<T>(isDev);
  const proxy = new Proxy(state as unknown as T, handler);

  // 3. 内部 API
  const internal: BridgeInternal<T> = {
    update(partial: Partial<T>) {
      for (const key of Object.keys(partial)) {
        state[key] = (partial as Record<string, unknown>)[key];
      }
    },
    getSnapshot() {
      return { ...state } as unknown as T;
    },
  };

  return { proxy, internal };
}
```

`update()` 使用**浅合并**而非深合并。这意味着：

```typescript
// 正确：替换整个 userInfo 对象
internal.update({
  userInfo: { id: '1', name: 'Alice', avatar: '/a.png' },
});

// 错误想法：只更新 name（浅合并不支持）
// internal.update({ userInfo: { name: 'Bob' } })
// 这会丢失 id 和 avatar
```

浅合并的优势：

- 语义明确：每次 `update()` 的 patch 就是最终状态，不需要猜测嵌套层级的合并策略
- 性能可控：不需要递归遍历深层对象
- 与 Pinia `$subscribe` 的 patch 格式一致

## 五、Store 到 Bridge 的同步链路

基座的 Pinia Store 是状态的"源头"。用户登录后 Store 更新了 token 和用户信息，这些变更需要实时同步到 Bridge，让子应用立刻可见。

### 5.1 同步监听器

```typescript
// sync-watchers.ts
import { toRaw } from 'vue';

export function setupSyncWatchers(internal: BridgeInternal): void {
  const userStore = useUserStore();
  const permStore = usePermissionStore();

  // 监听用户 Store 变更
  userStore.$subscribe(
    () => {
      internal.update({
        userInfo: toRaw(userStore.user),
        accessToken: toRaw(userStore.accessToken),
        refreshToken: toRaw(userStore.refreshToken),
        authorization: `Bearer ${userStore.accessToken}`,
        tenantId: toRaw(userStore.tenantId),
      });
    },
    { flush: 'sync' }
  );

  // 监听权限 Store 变更
  permStore.$subscribe(
    () => {
      internal.update({
        roles: toRaw(permStore.roles),
        permission: toRaw(permStore.permissions),
        menus: toRaw(permStore.menus),
      });
    },
    { flush: 'sync' }
  );
}
```

### 5.2 为什么是 `flush: 'sync'`

Pinia 的 `$subscribe` 默认使用 `flush: 'post'`，即在 DOM 更新之后才触发回调。这会导致一个时序问题：

```
Store 变更 → 组件 re-render → Bridge 同步
                ↑
          子应用在这里读 window.$CTX
          读到的是旧值！
```

使用 `flush: 'sync'` 后：

```
Store 变更 → Bridge 同步 → 组件 re-render
                              ↑
                    子应用在这里读 window.$CTX
                    读到的是新值 ✓
```

Bridge 更新发生在**同一个微任务**中，子应用在同一事件循环内读取 `window.$CTX` 就能拿到最新值。

### 5.3 为什么需要 `toRaw()`

Pinia Store 的 state 被 Vue 的 `reactive()` 包裹，是一个响应式 Proxy。如果直接把响应式 Proxy 传给 Bridge，会出现双层 Proxy：

```
window.$CTX.userInfo
  → Bridge 的 Proxy.get()
    → 拿到 Pinia 的 reactive Proxy
      → 冻结一个 Proxy 对象？ → 行为不可预测
```

`toRaw()` 提取 Proxy 背后的原始对象，确保 Bridge 拿到的是干净的纯数据。

## 六、基座初始化流程

Bridge 的初始化需要嵌入基座的启动顺序中，且对前后依赖有严格要求。

```typescript
// main.ts
async function bootstrap() {
  const app = createApp(App);

  // ① 全局错误处理
  setupGlobalErrorHandlers(app);

  // ② 安装 Pinia
  app.use(createPinia());

  // ③ 从 localStorage 恢复状态
  hydrateStoreFromLocal();

  // ④ 创建 Bridge（必须在子应用加载前）
  initBridge(import.meta.env.DEV);

  // ⑤ 启动微前端框架
  startMicroApp();

  // ⑥ 安装路由
  setupRouter(app);

  // ⑦ 挂载
  app.mount('#app');
}
```

**顺序约束：**

- ③ 必须在 ④ 之前：Store 必须先从 localStorage 恢复 token、权限等数据，否则 Bridge 初始状态为空
- ④ 必须在 ⑤ 之前：子应用预加载时会读 `window.$CTX`，必须确保已被 Proxy 替换
- ④ 必须在 ⑥ 之前：路由守卫可能依赖 Bridge 中的状态

```typescript
// init-bridge.ts
let _bridge: Bridge | null = null;

export function initBridge(isDev = false): Bridge {
  if (_bridge) return _bridge;

  // 1. 合并初始状态
  const initial: AppContext = {
    ...resolveStaticConfig(),  // 来自 config.js 的静态配置
    ...buildCurrentState(),     // 来自已恢复的 Pinia Store
    util: buildUtilApi(),       // 工具方法集
  };

  // 2. 创建 Bridge
  _bridge = createBridge(initial, isDev);

  // 3. 替换全局变量
  window.$CTX = _bridge.proxy;

  // 4. 安装 Store → Bridge 同步
  setupSyncWatchers(_bridge.internal);

  return _bridge;
}

export function updateBridge(partial: Partial<AppContext>): void {
  if (!_bridge) throw new Error('[Bridge] 未初始化');
  _bridge.internal.update(partial);
}
```

`resolveStaticConfig()` 支持运行时覆盖，允许部署时通过 `config.js` 注入不同的租户配置，无需重新构建：

```javascript
// public/config/config.js — 部署时按环境替换
(function () {
  window.$CTX = {
    appName: '仿真平台',
    tenantName: 'ACME',
    globalEventName: 'AppBus',
    showSecurityLevel: false,
    util: {},
  };
})();
```

## 七、子应用接入模式

子应用对 Bridge 的使用分为两种场景：**读取状态** 和 **调用工具方法**。

### 7.1 读取状态

```typescript
// 子应用中的 HTTP 拦截器
import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use(config => {
  // 直接从 Bridge 读取 token，无需订阅
  const token = window.$CTX.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 读取租户 ID
  const tenantId = window.$CTX.tenantId;
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }

  return config;
});
```

```vue
<!-- 子应用中的用户信息展示 -->
<script setup lang="ts">
import { computed } from 'vue';

const userName = computed(() => window.$CTX.userInfo?.nickname ?? '未登录');
const roles = computed(() => window.$CTX.roles ?? []);
const isAdmin = computed(() => roles.value.includes('admin'));
</script>

<template>
  <div class="user-badge">
    <span>{{ userName }}</span>
    <el-tag v-if="isAdmin" type="warning">管理员</el-tag>
  </div>
</template>
```

注意：这里的 `computed` 不会响应式更新。`window.$CTX` 不是 Vue 的响应式对象。如果需要响应式绑定，子应用可以包装一层 composable：

```typescript
// composables/use-context.ts
import { ref, onMounted, onUnmounted } from 'vue';

export function useContextValue<K extends keyof AppContext>(key: K) {
  const value = ref(window.$CTX[key]) as Ref<AppContext[K]>;

  let timer: ReturnType<typeof setInterval>;

  onMounted(() => {
    // 轮询检测变更（低频场景够用）
    timer = setInterval(() => {
      const current = window.$CTX[key];
      if (current !== value.value) {
        value.value = current;
      }
    }, 1000);
  });

  onUnmounted(() => clearInterval(timer));

  return value;
}
```

但在实际场景中，大多数全局状态（token、租户、权限）在页面生命周期内很少变化，直接读取已经足够。真正需要实时同步的场景（如工作空间切换），通常通过 CustomEvent 通知子应用刷新。

### 7.2 调用工具方法

```typescript
// 子应用中的 401 处理
http.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const { util } = window.$CTX;

      // 使用 Bridge 提供的 Token 刷新队列
      if (!util.TokenInstance.isRequesting) {
        util.TokenInstance.startRequestToken();
        try {
          await util.refreshToken();
          util.TokenInstance.endRequestToken();
          util.TokenInstance.execCb(); // 释放排队的请求
          return http(error.config);   // 重试原始请求
        } catch {
          util.logout(); // 刷新失败，跳转登录
        }
      } else {
        // 已有刷新请求在执行，排队等待
        return new Promise(resolve => {
          util.TokenInstance.addCb(() => {
            resolve(http(error.config));
          });
        });
      }
    }
    return Promise.reject(error);
  }
);
```

`util` 中的方法在基座侧执行，子应用调用时等同于跨应用的远程过程调用（RPC）。`logout()` 会清空基座的 Store 并跳转登录页，`refreshToken()` 使用基座的 HTTP 实例发起刷新请求——子应用完全不需要感知这些细节。

## 八、完整 Demo

下面用一个简化的 Demo 演示 Bridge 的核心机制。不依赖微前端框架，只用纯 TypeScript 展示 Proxy 保护、DeepFreeze、同步链路。

### 8.1 项目结构

```
bridge-demo/
├── package.json
├── tsconfig.json
├── src/
│   ├── bridge/
│   │   ├── freeze.ts           # DeepFreeze 实现
│   │   ├── readonly-handler.ts # Proxy 只读 Handler
│   │   ├── create-bridge.ts    # Bridge 工厂
│   │   └── types.ts            # 类型定义
│   ├── shell/
│   │   ├── store.ts            # 模拟 Store
│   │   ├── sync-watcher.ts     # Store → Bridge 同步
│   │   └── init.ts             # 初始化流程
│   ├── sub-app/
│   │   └── consumer.ts         # 子应用消费方
│   └── main.ts                 # 入口
└── __tests__/
    ├── freeze.test.ts
    ├── readonly-handler.test.ts
    ├── create-bridge.test.ts
    └── sync-watcher.test.ts
```

### 8.2 类型定义

```typescript
// src/bridge/types.ts

/** 全局上下文——子应用可读取的所有状态 */
export interface AppContext {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tenantId: string;
  readonly userInfo: UserInfo | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly appName: string;
  readonly util: ContextUtil;
}

export interface UserInfo {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
}

export interface ContextUtil {
  logout: () => void;
  refreshToken: () => Promise<void>;
}

/** Bridge 实例 */
export interface Bridge<T extends object = AppContext> {
  proxy: T;
  internal: BridgeInternal<T>;
}

export interface BridgeInternal<T extends object = AppContext> {
  update(partial: Partial<T>): void;
  getSnapshot(): T;
}
```

### 8.3 DeepFreeze

```typescript
// src/bridge/freeze.ts

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj as Readonly<T>;

  const proto = Object.getPrototypeOf(obj);
  if (
    proto !== Object.prototype &&
    proto !== Array.prototype &&
    proto !== null
  ) {
    return obj as Readonly<T>;
  }

  Object.freeze(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null) {
      deepFreeze(value);
    }
  }

  return obj as Readonly<T>;
}
```

### 8.4 只读 Handler

```typescript
// src/bridge/readonly-handler.ts

import { deepFreeze } from './freeze';

export function createReadonlyHandler<T extends object>(
  isDev: boolean
): ProxyHandler<T> {
  const frozenCache = new WeakMap<object, unknown>();

  return {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (value === null || value === undefined) return value;
      if (typeof value === 'function') return value;
      if (typeof value !== 'object') return value;

      const cached = frozenCache.get(value as object);
      if (cached !== undefined) return cached;

      const frozen = deepFreeze(value);
      frozenCache.set(value as object, frozen);
      return frozen;
    },

    set(_target, prop, _value) {
      const msg = `[Bridge] $CTX.${String(prop)} 是只读的，不允许修改`;
      if (isDev) throw new Error(msg);
      console.warn(msg);
      return true;
    },

    deleteProperty(_target, prop) {
      const msg = `[Bridge] 不允许删除 $CTX.${String(prop)}`;
      if (isDev) throw new Error(msg);
      console.warn(msg);
      return true;
    },
  };
}
```

### 8.5 Bridge 工厂

```typescript
// src/bridge/create-bridge.ts

import type { Bridge, BridgeInternal } from './types';
import { createReadonlyHandler } from './readonly-handler';

export function createBridge<T extends object>(
  initial: T,
  isDev = false
): Bridge<T> {
  const state = { ...initial } as Record<string, unknown>;

  const handler = createReadonlyHandler<T>(isDev);
  const proxy = new Proxy(state as unknown as T, handler);

  const internal: BridgeInternal<T> = {
    update(partial: Partial<T>) {
      for (const key of Object.keys(partial)) {
        state[key] = (partial as Record<string, unknown>)[key];
      }
    },
    getSnapshot() {
      return { ...state } as unknown as T;
    },
  };

  return { proxy, internal };
}
```

### 8.6 模拟 Store

```typescript
// src/shell/store.ts

type Listener = () => void;

/** 简化版 Store，模拟 Pinia 的 $subscribe 行为 */
export class SimpleStore<S extends object> {
  private _state: S;
  private _listeners: Listener[] = [];

  constructor(initial: S) {
    this._state = { ...initial };
  }

  get state(): Readonly<S> {
    return this._state;
  }

  /** 模拟 Pinia action 中的状态修改 */
  patch(partial: Partial<S>): void {
    this._state = { ...this._state, ...partial };
    // 同步通知所有订阅者（模拟 flush: 'sync'）
    for (const listener of this._listeners) {
      listener();
    }
  }

  /** 模拟 Pinia 的 $subscribe */
  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }
}
```

### 8.7 同步监听器

```typescript
// src/shell/sync-watcher.ts

import type { BridgeInternal, AppContext } from '../bridge/types';
import type { SimpleStore } from './store';

interface UserState {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  userInfo: { id: string; name: string; avatar: string } | null;
}

interface PermissionState {
  roles: string[];
  permissions: string[];
}

export function setupSyncWatchers(
  internal: BridgeInternal<AppContext>,
  userStore: SimpleStore<UserState>,
  permStore: SimpleStore<PermissionState>
): () => void {
  const unsub1 = userStore.subscribe(() => {
    const s = userStore.state;
    internal.update({
      accessToken: s.accessToken,
      refreshToken: s.refreshToken,
      tenantId: s.tenantId,
      userInfo: s.userInfo,
    });
  });

  const unsub2 = permStore.subscribe(() => {
    const s = permStore.state;
    internal.update({
      roles: s.roles,
      permissions: s.permissions,
    });
  });

  return () => {
    unsub1();
    unsub2();
  };
}
```

### 8.8 初始化流程

```typescript
// src/shell/init.ts

import type { AppContext } from '../bridge/types';
import { createBridge } from '../bridge/create-bridge';
import { SimpleStore } from './store';
import { setupSyncWatchers } from './sync-watcher';

// 模拟 window.$CTX
declare global {
  interface Window {
    $CTX: AppContext;
  }
}

export function bootstrap(isDev = true) {
  // ① 创建 Store 并恢复状态（模拟 hydrateStoreFromLocal）
  const userStore = new SimpleStore({
    accessToken: 'token-from-local-storage',
    refreshToken: 'refresh-token',
    tenantId: 'tenant-001',
    userInfo: { id: 'u1', name: '张三', avatar: '/avatar.png' },
  });

  const permStore = new SimpleStore({
    roles: ['user'],
    permissions: ['read', 'write'],
  });

  // ② 构建初始上下文
  const initial: AppContext = {
    accessToken: userStore.state.accessToken,
    refreshToken: userStore.state.refreshToken,
    tenantId: userStore.state.tenantId,
    userInfo: userStore.state.userInfo,
    roles: permStore.state.roles,
    permissions: permStore.state.permissions,
    appName: '仿真平台',
    util: {
      logout: () => console.log('[Shell] 用户登出'),
      refreshToken: async () => {
        console.log('[Shell] 刷新 Token...');
        userStore.patch({ accessToken: 'new-token-' + Date.now() });
      },
    },
  };

  // ③ 创建 Bridge
  const bridge = createBridge(initial, isDev);

  // ④ 挂载到全局
  window.$CTX = bridge.proxy;

  // ⑤ 安装同步监听
  setupSyncWatchers(bridge.internal, userStore, permStore);

  return { userStore, permStore, bridge };
}
```

### 8.9 子应用消费

```typescript
// src/sub-app/consumer.ts

export function subAppDemo() {
  console.log('=== 子应用启动 ===');

  // 1. 读取全局状态
  console.log('Token:', window.$CTX.accessToken);
  console.log('用户:', window.$CTX.userInfo?.name);
  console.log('角色:', window.$CTX.roles);

  // 2. 尝试修改（开发环境会抛错）
  try {
    (window.$CTX as Record<string, unknown>).accessToken = 'hacked';
  } catch (e) {
    console.log('写入被拦截:', (e as Error).message);
  }

  // 3. 嵌套对象也被冻结
  const userInfo = window.$CTX.userInfo;
  if (userInfo) {
    try {
      (userInfo as Record<string, unknown>).name = 'hacked';
    } catch (e) {
      console.log('嵌套写入被拦截:', (e as Error).message);
    }
  }

  // 4. 引用稳定性
  const ref1 = window.$CTX.userInfo;
  const ref2 = window.$CTX.userInfo;
  console.log('引用相等:', ref1 === ref2); // true

  // 5. 调用工具方法
  console.log('调用 refreshToken...');
  window.$CTX.util.refreshToken().then(() => {
    console.log('刷新后 Token:', window.$CTX.accessToken);
  });
}
```

### 8.10 主入口

```typescript
// src/main.ts

import { bootstrap } from './shell/init';
import { subAppDemo } from './sub-app/consumer';

const { userStore, permStore } = bootstrap(true);

// 模拟子应用加载
subAppDemo();

// 模拟基座侧的状态变更
setTimeout(() => {
  console.log('\n=== 基座更新权限 ===');
  permStore.patch({ roles: ['user', 'admin'] });
  console.log('子应用看到的角色:', window.$CTX.roles);
  // 输出: ['user', 'admin']
}, 100);

setTimeout(() => {
  console.log('\n=== 基座更新用户 ===');
  userStore.patch({
    userInfo: { id: 'u1', name: '李四', avatar: '/new.png' },
  });
  console.log('子应用看到的用户:', window.$CTX.userInfo?.name);
  // 输出: 李四
}, 200);
```

### 8.11 运行

```bash
# package.json
{
  "scripts": {
    "dev": "tsx src/main.ts",
    "test": "vitest run"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

```bash
pnpm install
pnpm dev
```

预期输出：

```
=== 子应用启动 ===
Token: token-from-local-storage
用户: 张三
角色: [ 'user' ]
写入被拦截: [Bridge] $CTX.accessToken 是只读的，不允许修改
嵌套写入被拦截: Cannot assign to read only property 'name' of object '#<Object>'
引用相等: true
调用 refreshToken...
[Shell] 刷新 Token...
刷新后 Token: new-token-1713264201000

=== 基座更新权限 ===
子应用看到的角色: [ 'user', 'admin' ]

=== 基座更新用户 ===
子应用看到的用户: 李四
```

### 8.12 测试用例

```typescript
// __tests__/freeze.test.ts
import { describe, it, expect } from 'vitest';
import { deepFreeze } from '../src/bridge/freeze';

describe('deepFreeze', () => {
  it('递归冻结嵌套对象', () => {
    const obj = { a: { b: { c: 42 } } };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
  });

  it('冻结数组及其元素', () => {
    const arr = [{ x: 1 }, { x: 2 }];
    deepFreeze(arr);
    expect(Object.isFrozen(arr)).toBe(true);
    expect(Object.isFrozen(arr[0])).toBe(true);
  });

  it('跳过类实例', () => {
    class Token { value = 'secret'; }
    const obj = { token: new Token() };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.token)).toBe(false);
  });

  it('幂等：已冻结对象直接返回', () => {
    const obj = Object.freeze({ a: 1 });
    const result = deepFreeze(obj);
    expect(result).toBe(obj);
  });

  it('处理 null/undefined/原始类型', () => {
    expect(deepFreeze(null)).toBe(null);
    expect(deepFreeze(undefined)).toBe(undefined);
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze('hello')).toBe('hello');
  });
});
```

```typescript
// __tests__/readonly-handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createReadonlyHandler } from '../src/bridge/readonly-handler';

describe('createReadonlyHandler', () => {
  function makeProxy(isDev: boolean) {
    const state = {
      token: 'abc',
      user: { id: '1', name: 'test' },
      count: 42,
      fn: () => 'hello',
      empty: null,
    };
    const handler = createReadonlyHandler<typeof state>(isDev);
    return new Proxy(state, handler);
  }

  it('原始类型直接返回', () => {
    const proxy = makeProxy(true);
    expect(proxy.token).toBe('abc');
    expect(proxy.count).toBe(42);
  });

  it('null 直接返回', () => {
    const proxy = makeProxy(true);
    expect(proxy.empty).toBe(null);
  });

  it('函数不冻结', () => {
    const proxy = makeProxy(true);
    expect(proxy.fn()).toBe('hello');
  });

  it('对象被深度冻结', () => {
    const proxy = makeProxy(true);
    const user = proxy.user;
    expect(Object.isFrozen(user)).toBe(true);
  });

  it('缓存保证引用稳定', () => {
    const proxy = makeProxy(true);
    expect(proxy.user).toBe(proxy.user);
  });

  it('DEV 模式 set 抛错', () => {
    const proxy = makeProxy(true);
    expect(() => {
      (proxy as Record<string, unknown>).token = 'x';
    }).toThrow('只读');
  });

  it('PROD 模式 set 静默', () => {
    const proxy = makeProxy(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (proxy as Record<string, unknown>).token = 'x';
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('只读')
    );
    expect(proxy.token).toBe('abc'); // 值未改变
    warn.mockRestore();
  });

  it('DEV 模式 delete 抛错', () => {
    const proxy = makeProxy(true);
    expect(() => {
      delete (proxy as Record<string, unknown>).token;
    }).toThrow('不允许删除');
  });
});
```

```typescript
// __tests__/create-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { createBridge } from '../src/bridge/create-bridge';

describe('createBridge', () => {
  const initial = {
    token: 'init-token',
    user: { id: '1', name: 'Alice' },
  };

  it('proxy 反映初始状态', () => {
    const { proxy } = createBridge(initial, true);
    expect(proxy.token).toBe('init-token');
    expect(proxy.user.name).toBe('Alice');
  });

  it('internal.update 浅合并', () => {
    const { proxy, internal } = createBridge(initial, true);
    internal.update({ token: 'new-token' });
    expect(proxy.token).toBe('new-token');
    expect(proxy.user.name).toBe('Alice'); // 未被覆盖
  });

  it('internal.update 替换嵌套对象', () => {
    const { proxy, internal } = createBridge(initial, true);
    internal.update({ user: { id: '2', name: 'Bob' } });
    expect(proxy.user.id).toBe('2');
    expect(proxy.user.name).toBe('Bob');
  });

  it('getSnapshot 返回浅拷贝', () => {
    const { internal } = createBridge(initial, true);
    const snap = internal.getSnapshot();
    expect(snap.token).toBe('init-token');
    expect(snap).not.toBe(initial);
  });

  it('proxy 修改不影响 snapshot', () => {
    const { proxy, internal } = createBridge(initial, true);
    const snap = internal.getSnapshot();
    internal.update({ token: 'changed' });
    expect(proxy.token).toBe('changed');
    expect(snap.token).toBe('init-token'); // snapshot 是快照
  });
});
```

```typescript
// __tests__/sync-watcher.test.ts
import { describe, it, expect } from 'vitest';
import { createBridge } from '../src/bridge/create-bridge';
import { SimpleStore } from '../src/shell/store';
import { setupSyncWatchers } from '../src/shell/sync-watcher';
import type { AppContext } from '../src/bridge/types';

describe('setupSyncWatchers', () => {
  function setup() {
    const userStore = new SimpleStore({
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      tenantId: 't1',
      userInfo: { id: 'u1', name: '张三', avatar: '/a.png' },
    });

    const permStore = new SimpleStore({
      roles: ['user'],
      permissions: ['read'],
    });

    const bridge = createBridge<AppContext>(
      {
        accessToken: userStore.state.accessToken,
        refreshToken: userStore.state.refreshToken,
        tenantId: userStore.state.tenantId,
        userInfo: userStore.state.userInfo,
        roles: permStore.state.roles,
        permissions: permStore.state.permissions,
        appName: 'test',
        util: { logout: () => {}, refreshToken: async () => {} },
      },
      true
    );

    const dispose = setupSyncWatchers(bridge.internal, userStore, permStore);

    return { bridge, userStore, permStore, dispose };
  }

  it('userStore 变更同步到 proxy', () => {
    const { bridge, userStore } = setup();
    userStore.patch({ accessToken: 'new-token' });
    expect(bridge.proxy.accessToken).toBe('new-token');
  });

  it('permStore 变更同步到 proxy', () => {
    const { bridge, permStore } = setup();
    permStore.patch({ roles: ['user', 'admin'] });
    expect(bridge.proxy.roles).toEqual(['user', 'admin']);
  });

  it('userInfo 整体替换后引用变化', () => {
    const { bridge, userStore } = setup();
    const oldRef = bridge.proxy.userInfo;
    userStore.patch({
      userInfo: { id: 'u2', name: '李四', avatar: '/b.png' },
    });
    const newRef = bridge.proxy.userInfo;
    expect(newRef).not.toBe(oldRef);
    expect(newRef?.name).toBe('李四');
  });

  it('dispose 后不再同步', () => {
    const { bridge, userStore, dispose } = setup();
    dispose();
    userStore.patch({ accessToken: 'after-dispose' });
    expect(bridge.proxy.accessToken).toBe('old-token'); // 未变
  });
});
```

## 九、常见陷阱与排查

### 9.1 子应用读到空值

**症状**：`window.$CTX.accessToken` 返回 `''` 或 `undefined`。

**原因**：子应用在 Bridge 初始化之前就访问了 `window.$CTX`。通常是子应用的 `<script>` 标签在基座 `bootstrap()` 之前执行。

**排查**：在 `initBridge()` 开头打断点，确认执行顺序。确保子应用入口在微前端框架注册之后才加载。

### 9.2 嵌套修改未报错

**症状**：`window.$CTX.userInfo.name = 'x'` 没有抛错也没有警告。

**原因**：Proxy 只拦截**顶层**的 `set`，嵌套对象的写保护依赖 `deepFreeze`。如果 `deepFreeze` 跳过了某个对象（比如它是类实例），修改就不会被拦截。

**排查**：检查被修改的对象的 `Object.getPrototypeOf()`，确认是否为 `Object.prototype`。

### 9.3 Store 更新后子应用未看到新值

**症状**：基座 Pinia Store 变了，但 `window.$CTX` 还是旧值。

**原因**：
- `$subscribe` 没有用 `flush: 'sync'`，导致更新被推迟到下一个 tick
- `update()` 时忘记用 `toRaw()` 解包 reactive Proxy，导致后续读取行为异常
- Store 的 action 抛了异常，`$subscribe` 回调未执行

**排查**：在 `$subscribe` 回调内加日志，确认是否被触发。用 `internal.getSnapshot()` 检查 Bridge 内部状态。

### 9.4 内存泄漏

**症状**：长时间运行后内存持续增长。

**原因**：`WeakMap` 的 key 是源对象引用。如果 `update()` 每次都创建全新对象，旧缓存会自动被 GC。但如果某处保持了旧对象的引用（比如闭包），缓存就不会被回收。

**排查**：用 Chrome DevTools Memory 面板拍摄堆快照，搜索 `Frozen` 或 `Object.freeze` 相关的对象链。

## 十、方案对比

| 维度 | Proxy Bridge | EventBus | 共享 Store | localStorage |
|------|-------------|----------|-----------|-------------|
| 读取方式 | `window.$CTX.xxx` | 订阅事件 + 本地缓存 | `import store` | `JSON.parse(localStorage.getItem(...))` |
| 类型安全 | TypeScript 接口约束 | 手动类型断言 | 完整类型 | 无 |
| 写保护 | Proxy + DeepFreeze | 无（依赖约定） | 无 | 无 |
| 同步延迟 | 同一微任务 | 取决于 emit 时机 | 同步 | 需轮询 |
| 子应用耦合 | 仅依赖 `window.$CTX` 类型 | 依赖事件名约定 | 强依赖 Store 包版本 | 依赖 key 命名约定 |
| 响应式 | 无（需 composable 桥接） | 天然事件驱动 | 完整响应式 | 无 |
| 初始化时机 | 需严格控制顺序 | 灵活 | 需保证 Store 单例 | 灵活 |
| 调试体验 | DevTools 可直接查看 Proxy | 需事件日志 | DevTools Pinia 插件 | DevTools Storage 面板 |

**选型建议**：

- 子应用数量多、团队分散 → Proxy Bridge（最小耦合）
- 实时性要求极高、需双向通信 → EventBus 补充
- 团队统一技术栈、发版节奏一致 → 共享 Store 最简单
- 无框架约束、需跨 Tab → localStorage + BroadcastChannel

## 十一、最佳实践

1. **Bridge 初始化必须在子应用加载前**——否则子应用拿到的是未代理的原始对象
2. **`$subscribe` 使用 `flush: 'sync'`**——确保同微任务内同步
3. **传递给 `update()` 的数据用 `toRaw()` 解包**——避免双层 Proxy
4. **`update()` 是浅合并**——嵌套对象必须整体替换，不能只改一个字段
5. **DeepFreeze 跳过类实例**——`Date`、`Map` 等内置类和自定义类不冻结
6. **DEV 模式抛错，PROD 模式静默**——开发阶段暴露问题，生产环境不影响用户
7. **`util` 中的方法在基座侧执行**——子应用调用等于跨应用 RPC
8. **部署时配置用 `config.js` 注入**——无需重新构建即可切换环境

## 十二、附录：类型速查

```typescript
// 完整 AppContext 类型
interface AppContext {
  // 认证
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tenantId: string;

  // 用户
  readonly userInfo: UserInfo | null;

  // 权限
  readonly roles: readonly string[];
  readonly permissions: readonly string[];

  // 配置
  readonly appName: string;

  // 工具方法（在基座侧执行）
  readonly util: ContextUtil;
}

// Bridge 工厂签名
function createBridge<T extends object>(
  initial: T,
  isDev?: boolean
): Bridge<T>;

// Bridge 实例
interface Bridge<T> {
  proxy: T;           // 子应用通过此访问
  internal: {
    update(p: Partial<T>): void;  // 基座专用
    getSnapshot(): T;              // 调试/测试用
  };
}

// DeepFreeze 签名
function deepFreeze<T>(obj: T): Readonly<T>;

// 只读 Handler 签名
function createReadonlyHandler<T extends object>(
  isDev: boolean
): ProxyHandler<T>;
```
