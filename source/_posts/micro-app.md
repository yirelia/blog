---
title: micro-app 搭建记录
date: 2023-09-06 23:11:39
tags: vue
---

## 搭建平台基座
｜ 基座与平台无关，技术栈 vite + vue3 + element-plus
- 通过vite 脚手架搭建项目

```bash
# npm 7+, extra double-dash is needed:
npm create vite@latest my-vue-app -- --template vue-ts

```
- 安装 micro-app 
``` bash
npm i @micro-zoe/micro-app --save
```

- 入口文件添加 **micro-app**
```typescript
 import microApp from '@micro-zoe/micro-app';
 microApp.start({
    destroy: true
 })

const app = createApp()
app.mount('#root')

```

- 安装element-plus 
| 由于 micro-app 基座应用的样式类无法被隔离，建议修改elment-plus样式类的命名空间
```bash
npm i element-plus
```
修改 element-plus 命名空间
element plus 当前可以全局导入，如果需要按需导入修改命名空间 可参考官网

**设置 ElConfigProvider**
使用 ElConfigProvider 包装您的根组件。
```vue
<!-- App.vue -->
<template>
  <el-config-provider namespace="sk">
    <router-view></router-view>
  </el-config-provider>
</template>
```
**设置 SCSS 和 CSS 变量**
创建 styles/element/index.scss：
```scss
// styles/element/index.scss
// we can add this to custom namespace, default is 'el'
@forward 'element-plus/theme-chalk/src/mixins/config.scss' with (
  $namespace: 'sk'
);

@use "element-plus/theme-chalk/src/index.scss" as *;
// ...

```
在 vite.config.ts 中导入 styles/element/index.scss：
```ts
import { defineConfig } from 'vite'
// https://vitejs.dev/config/
export default defineConfig({
  // ...
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "~/styles/element/index.scss" as *;`,
      },
    },
  },
  // ...
})
```

**子应用 vite 挂载**

- 挂载子应用路由
```ts
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...,
    {
      path: '/ys-mse:*',
      name: 'mse',
      component: () => import('@/views/mse/index.vue'),
    },
  ],
});
```
- vite子应用组件挂载
子应用micro-app 中需要区分 URL与baseroute 关系具体可[参考官网](https://zeroing.jd.com/micro-app/docs.html#/zh-cn/route)
  - URL 为获取index.html静态资源的加载路由
  - baseroute 为下发子应用的区分路由


```ts
<template>
  <div class="mse-iframe-container">
  // 加载vite 应用需要关闭沙箱
    <micro-app name="mse" url="http://localhost:8004" :data="{}" baseroute="/child/vite-vue" inline disablesandbox></micro-app>
  </div>
</template>
<script setup lang="ts">
import { EventCenterForMicroApp } from '@micro-zoe/micro-app'
import config, { getAppUrl } from '@/micro-app/config.ts'
import { ref } from 'vue';
// @ts-ignore 因为vite子应用关闭了沙箱，我们需要为子应用mse创建EventCenterForMicroApp对象来实现数据通信
window.eventCenterForAppNameVite = new EventCenterForMicroApp('mse')
</script>
<style lang="less" scoped>
.mse-iframe-container {
  height: 100%;
}
</style>
```


# vite 子应用
  按照正常方式搭建vite 子应用，main.ts && serve 服务需要改造

  - main.ts 入口文件文件
```ts
function handleMicroData () {
  // eventCenterForAppNameVite 是基座添加到window的数据通信对象
  if (window.eventCenterForAppNameVite) {
    console.log('====> mse window', window)
    // 主动获取基座下发的数据
    const rootData = window.eventCenterForAppNameVite.getData()
    console.log('mse root getData:',toRaw(rootData))
    console.log('__MICRO_APP_ENVIRONMENT__ =======> ',window.__MICRO_APP_ENVIRONMENT__)
    console.log('__MICRO_APP_BASE_APPLICATION__ =======> ',window.__MICRO_APP_BASE_APPLICATION__)
    console.log('__MICRO_APP_PUBLIC_PATH__ =======> ',window.__MICRO_APP_PUBLIC_PATH__)
    console.log('__MICRO_APP_BASE_ROUTE__ =======> ',window.__MICRO_APP_BASE_ROUTE__)
    console.log('eventCenterForAppNameVite =======> ',window.eventCenterForAppNameVite)
  }
}


const app = createApp(App)
app.use(router);
app.mount('#app')

handleMicroData()
// 监听卸载操作
window.addEventListener('unmount', function () {
  app.unmount()
  // 卸载所有数据监听函数
  window.eventCenterForAppNameVite?.clearDataListener()
  console.log('微应用机电卸载了')
})
```
vite.config.ts
- server 需要支持 跨域请求
- 打包时处理
  - 指定域名设置
  - 通过动态basePath插件 vite-plugin-dynamic-base  类似webpack \_\_webpack_public_path\_\_
  
```ts
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { dynamicBase } from 'vite-plugin-dynamic-base'
// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "__dynamic_base__" : "/child/vite-vue/",
  plugins: [
    vue(),
    vueJsx(),
    //打包后 
    dynamicBase({
      publicPath: 'window.__dynamic_base__',
      transformIndexHtml:  true
    })
  ],
  server: {
    port: 8004,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    cors: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})

```

# 部署
[参考官网配置](https://zeroing.jd.com/micro-app/docs.html#/zh-cn/deploy)

# 问题&&解决方案
1. 部署后无法加载vite 子应用，原因可能
   - window.\_\_dynamic_base\_\_ 属性未初始化成功
   - 基座应用加载vite-vue 子应用时使用了预加载模式，

2. 父子资源样式相互污染
   - 如果基座样式库使用 elment-plus 可以通过自定义命名空间规避污染
   - 开启沙盒模式进行样式隔离