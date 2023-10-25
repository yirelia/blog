---
title: 搭建 electron开发环境
date: 2023-10-17 14:02:22
tags: electron
---

#基础项目搭建

## 通过vite脚手架vue3前端项目
```bash
npm create vite@latest electron-vue -- --template vue-ts
```
## 添加 electron  
安装electron && electron-builder
```bash
npm i -D electron
npm i -D electron-builder
```
##安装开源插件 [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)
```bash
npm i -D vite-plugin-electron
```
## vite-config.ts 引入vite-plugin-electron 插件
```ts
import electron from 'vite-plugin-electron/simple';
import path from 'node:path'
export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts'
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts')
      },
      // Ployfill the Electron and Node.js built-in modules for Renderer process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: {}
    })
  ],
  server: {
    port: 9222
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: pathResolve('src')
      }
    ]
  }
});
```

## 添加electron 入口文件
```bash
cd electron-vue 
mkdir electron
touch main.ts # 入口主文件
touch preload.ts # 预加载脚本
```
main.ts
```ts
import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';

let mainWindow: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

function createWindow() {
  mainWindow = new BrowserWindow({
    // 修改窗口图标
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    title: '测试',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}

function loadWinApp() {
  startBackendServer().then(() => {
    console.log('[info]server is stared');
  });

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
      mainWindow = null;
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.whenReady().then(async () => {
    // 创建窗口
    createWindow();
  });
}
loadWinApp()

```
## 启动项目 项目
```bash
npm run dev
```



