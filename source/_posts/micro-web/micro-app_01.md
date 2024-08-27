---
title: micro-app 基座应用和子应用共享window 全局变量
date: 2023-09-07 23:11:39
tags: 微前端
---
micro-app 运行时沙盒机制，会将基座应用window 自己配置的全局变量无法共享
具体可以参考

```ts
/**
 * rewrite special properties of window
 * @param appName app name
 * @param microAppWindow child app microWindow
 */
function patchWindowProperty (
  microAppWindow: microAppWindowType,
):void {
  const rawWindow = globalEnv.rawWindow
  Object.getOwnPropertyNames(rawWindow)
    .filter((key: string) => {
      return /^on/.test(key) && !SCOPE_WINDOW_ON_EVENT.includes(key)
    })
    .forEach((eventName: string) => {
      const { enumerable, writable, set } = Object.getOwnPropertyDescriptor(rawWindow, eventName) || {
        enumerable: true,
        writable: true,
      }
      rawDefineProperty(microAppWindow, eventName, {
        enumerable,
        configurable: true,
        get: () => rawWindow[eventName],
        set: writable ?? !!set
          ? (value) => { rawWindow[eventName] = value }
          : undefined,
      })
    })
}

```
如果在项目中想通过子应用直接访问 基座应用window上属性有两种方案
例如基座应用的window对象上自定影了 $name
```ts
window.$name = 'xxxxxx'
```

1. 子应用中通过window.rawWindow 拿到原始对象

```ts
 const name = window.rawWindow.$name
 
```

2. 通过micro-app 的内置的plugin 定义全局processHtml 拦截处理, 将共有属性通过立即执行函数给子应用赋值，达到在子应用中直接通过window 获取对应的属性
```ts
 plugins: {
      global: [
        {
          escapeProperties: [],
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          processHtml(code: string, url: string) {
            // 全局注入 $YS 对象
            const data = `<head><script>(function(window) {window.$name = window.rawWindow.$name})(window)</script>`;
            code = code.replace('<head>', data);
            return code;
          }
        }
      ],
      modules: {}
    }
```
子应用可以通过 window.$name 获取到对应的值
