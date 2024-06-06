---
title: pnpm 搭建 monorepo目录记录
date: 2024-06-01 18:22:26
tags: monorepo
---

# pnpm-monorepo 搭建记录

## 技术选型
1. node 版本 `V18.19.1`
1. 包管理 [`pnpm`](https://www.pnpm.cn/)
3. 微前端框架 [`micro-app`](https://micro-zoe.github.io/micro-app/docs.html#/)

## 全局安装 pnpm
```bash
npm i pnpm -g 
```
## 初始化项目
```bash
mkdir pnpm-monorepo
cd pnpm-monorepo
pnpm init
echo -e "node_modules" > .gitignore
npm pkg set engines.node=">=18.19.1"
npm pkg set type="module"
```

## 配置workspace配置文件
1. 创建 pnpm-workspace.yaml文件
```bash
tourch pnpm-workspace.yaml
``` 
2. 编辑`pnpm-workspace.yaml`添加以下配置
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
``` 
3. 根目录下创建 `apps`&&`packages`目录
```bash
mkdir apps packages
```
## 创建项目基础共享代码包 `share`
- 创建一个全局公有类，给`apps`下的目录共享
```bash
cd packages
pnpm create vite share --tempate vue-ts
cd ..
pnpm i
npm pkg set scripts.share="pnpm --filter share"
```
- 在`main.ts`创建一些基础工具类，例如以下
```ts
export function openWindow = (url: string, isNew: boolean) => {     const target = isNew ? '_self' : '_blank';
      window.open(url, target);

}
```
- 删除多余文件
```
rm -rf src/components src/App.vue src/style.css src/vite-env.d.ts index.html .gitignore
```
- 将`share`已库的形式编译打包
vite编译入口文件默认为 `index.html`文件，我们需要修改build 入口文件修改 `src/main.ts`, `vite-config.ts` 配置如下
```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: format => `utils.${format}.js`
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  },
  resolve: { alias: { src: resolve('src/') } },
  plugins: []
});

```
为库提供自动生成类型插件，可以安装`vite-plugin-dts`
```bash
pnpm share install vite-plugin-dts
```
在vite-config添加以下配置
```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts'
// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: format => `utils.${format}.js`
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  },
  resolve: { alias: { src: resolve('src/') } },
  plugins: [dts()]
});

```
- 在`package.json`添加入库文件&&类型文件
```json
{
 ...,
 "name": "@co/share",
 "main": "./dist/common.js",
 "types": "./dist/main.d.ts",
}
``` 
## 创建web应用
- 进入 `apps` 创建APP
```bash
cd apps
pnpm create vite base-micro vue-ts
```
- 进入跟目录创建`.npmrc`
```bash
touch .npmrc
```
- `.npmrc` 添加以下配置
```yaml
registry=https://registry.npmjs.org/
link-workspace-packages=true # 允许pnpm从本地安装包
```
- 在 `base-micro` 安装包
```bash
pnpm install @co/share --filter base-micro
```
安装后，`base-micro`应用的 `package.json`中出现如下依赖
```json
 {
  ...,
    "dependencies": {
    "@co/share": "workspace:*", # 本地库依赖
    }
 }
```
- 在base-micro  `main.ts` 中 可以引用 `@co/share`中的方法
```ts
import { createApp } from 'vue';
import 'nprogress/nprogress.css';
import App from './App.vue';
import { setupRouter } from './router';
import { openWindow } from '@co/share';
const app = createApp(App);
function bootStrap() {
  setupRouter(app);
  app.mount('#app');
}
bootStrap();
openWindow('https://cn.bing.com')

```
