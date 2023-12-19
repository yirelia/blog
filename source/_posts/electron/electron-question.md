---
title: electron 常见问题&&解决方案
date: 2023-10-25 15:34:16
tags: electron
---

# 扩展electron vue-devtools
[dev-tool 官方指导文档](https://www.electronjs.org/zh/docs/latest/tutorial/devtools-extension)
## 开启devTool
```ts
// create windown 调用
createWindow() {
    ....
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
}

```
## 加载vue-devtool
1. 在 Google Chrome 中安装扩展(也可以下载源码离线编译)
2.  打开chrome://extensions 获取扩展hash值，
3.  找到 Chrome 扩展程序的存放目录：
    在Ｗindows 下为 %LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions;
    在 Linux下为：
    ~/.config/google-chrome/Default/Extensions/
    ~/.config/google-chrome-beta/Default/Extensions/
    ~/.config/google-chrome-canary/Default/Extensions/
    ~/.config/chromium/Default/Extensions/
    在 macOS下为~/Library/Application Support/Google/Chrome/Default/Extensions。
4. 将扩展的位置传递给 ses.loadExtension API
```ts
// username 电脑用户名
// extendsionId 
const vueDevToolsPath = `C:\\Users\\${username}\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\${extendsionId}\\${extendsionVersion}`
app.whenReady().then(async () => {
    if (VITE_DEV_SERVER_URL) {
      // 加载vue3 代码调试工具
      await session.defaultSession.loadExtension(vueDevToolsPath);
    }
    // 创建窗口
    createWindow();
  });
```
![](/img/electron/electron-devtool.png)

# Electron 启动后端服务
## 通过execFile 启动可执行的exe文件
例如我们现在有一个app.exe 放入项目的根目录 resources文件下
```ts
import {execFile} from '‘child_process’'
const backend = path.join(process.cwd(), '/resources/app.exe')
cosnt childProcess = execfile(
 backend,
 {
  windowsHide: true,
 },
 (err, stdout, stderr) => {
  if (err) {
  console.log(err);
  }
  if (stdout) {
  console.log(stdout);
  }
  if (stderr) {
  console.log(stderr);
  }
 }
)
```
## electron 退出
electron 应用退出后可执行命令退出子程序
程序执行再 __app.quit()__ 之前执行
```ts
import { exec }  from 'child_process';
exec('taskkill /f /t /im app.exe', (err, stdout, stderr) => {
 if (err) {
  console.log(err)
 return;
 }
});
```
# 应用单开
可通过 requestSingleInstanceLock() 方案添加应用单开处理
requestSingleInstanceLock API 可以参考[官网解释](https://www.electronjs.org/zh/docs/latest/api/app#requestSingleInstanceLock)
- 通过requestSingleInstanceLock 获取单例
- 根据 单例锁状态 判断是否展示应用还是关闭应用
```ts
const appInstanceLock = app.requestSingleInstanceLock();
if (!appInstanceLock) {
  app.quit();
} else {
  // 开启APP
  loadWinApp();
}

app.whenReady().then(()=> {
  ....
  // 只允许打开一个窗口

  app.on('second-instance', () => {
    win!.show();
  });
})
```

# win7 桌面端支持
electron23.0 之后不再支持win7&&win8 等，详情见[官方文档](https://github.com/electron/electron/tree/main)
如果程序需要支持可以将electron 降级版本
 - electron 22.0
 - electron-builder 22.10.5

 # win7 打包后程序安装提示启动错误
 需要安装依微软常用的依赖库
 [微软常用运行库合集](/resource/微软常用运行库合集_2023.03.03.exe)

 # 客户端 getAppPath 含有 app.asar 问题处理
 getAppPath()可以获取到程序运行跟目录，打包后会有app.asar
 当前可以直接通过replace 函数替换 app.asar
 例如：
 ```ts
 const appRootPath = app.getAppPath().repace('app.asar', '')

 ```
# vite-vue3 页面中图片显示错误问题处理
图片地址为类似
```ts
const img = '/img/test.png'
```
本地开发时预览正常electron 打包线上后显示地址找不到
处理方案将图片地址转为绝对地址路径
```ts
const img = new URL('/image/sludge.png', import.meta.url).href
```