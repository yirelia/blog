---
title: micro-app 搭建记录
date: 2023-09-06 23:11:39
tags: 微前端
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
