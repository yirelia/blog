---
title: 微前端搭建总结
date: 2024-08-06 23:11:39
tags: 前端
category: 微前端
---
确定启用微前端处理公司业务时，通过微前端 __4个关键性决策__ 考虑设计
根据微前端架构决策：
- 微前端在架构中的定义
- 微前端的组合
- 微前端的路由
- 微前端之间的通信


### 定义微前端
首先我们可以根据自身业务，判断前端业务试图是，横向拆分，还是纵向拆分。
- 横向业务如下所示
业务在横向拆分时，一个视图上有多个微前端，这些组成部分可以由不同团队开发
![](/img/micro-app/micro-横向业务.png)

- 纵向业务拆分如下所示
纵向拆分业务中，一次视图上只有一个微前端，每个团队只开发自己的业务规则
![](/img/micro-app/micro-纵向业务.png)


### 微前端组合
微前端组合分为
- 客户端组合
- 边缘侧组合
- 服务端组合

目前根据业务选择自己所需的组合方案，目前一般会选择客户端组合，方式客户端组合方式，即通过一个APP shell 通过URL来加载不同微前端，当前开源的技术站有如下几种
1. SPA
2. qiankun
3. micro-app
当前也可以直接通过Iframe 加载实现

### 微前端路由
微前端路由两种组合方式
- 服务端路由
- 边缘侧路由
- 客户端路由

如果技术站上处理使用SPA这种技术站，建议通过客户端进行路由组合，通过客户端路由组合时，在基座中处理路由，即可通过配置等操作实现复杂路由操作。

### 微前端通信
理论上当业务独立时，每个微前端业务独立，不需要和其他微前端通信，在实际业务中，每个微前端确实需要根据业务进行通信。通信原则是，每个微前端不知道其他微前端的存在，否则违反的独立部署的原则。

通信方式可以采用如下两种
- 全局事件总线
在每一个微前端中注入事件总线，每个微前端只定义自己关心的事件信息
![](/img/micro-app/micro-纵向业务.png)

- 通过自定义事件
使用自定义事件的好处是可以将通信逻辑封装在各个微前端内部，使得各个微前端之间的通信更加独立和可控。
```javascript
// 通过自定义事件
// 创建一个自定义事件
const customEvent = new CustomEvent('myCustomEvent', {
  detail: {
    message: 'Hello from custom event!'
  }
});

// 监听自定义事件
document.addEventListener('myCustomEvent', function(event) {
  console.log(event.detail.message);
});

// 触发自定义事件
document.dispatchEvent(customEvent);
```
```javascript
// 通过自定义事件
// 创建一个自定义事件
const customEvent = new CustomEvent('myCustomEvent', {
  detail: {
    message: 'Hello from custom event!'
  }
});

// 监听自定义事件
document.addEventListener('myCustomEvent', function(event) {
  console.log(event.detail.message);
});

// 触发自定义事件
document.dispatchEvent(customEvent);
```









