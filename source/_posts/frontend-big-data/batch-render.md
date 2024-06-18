---
title: 前端x6分批万级节点
date: 2024-06-10 16:59:29
tags:
---
# 需求
前端画布上需要渲染`10万节点`，技术方案选择 vue3 + [x6](https://x6.antv.antgroup.com/tutorial/getting-started)

当前生成节点测试对象为如下
```ts
    const generateRandomPosition = () => {
        const x = Math.floor(Math.random() * 8000);
        const y = Math.floor(Math.random() * 8000);
        return { x, y, width: 100, height: 40 };
    };
    function genData() {
        graphData.value = []
        for (let i = 0; i < num.value; i++) {
            const position = generateRandomPosition();
            graphData.value.push(position)
        }
    }


```

## 最简单个循环添加
```ts
for(const node of nodes) {
    graph.value.addNode(node)
}
```
10万节点单个加载时，会导致住主线程卡死
经测试耗时大概：1003301.880859375 ms

## 调用x6批量添加 nodes
```ts
const nodes = [....]
graph.value.addNode(nodes)

```

经测试耗时大概：页面会卡死，等待响应

## 分批 [requestAnimationFrame](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/requestAnimationFrame) 渲染处理

```ts
    function start(graph: Graph, nodes: any[]) {
        let chunkSize = 100
        let chunkCount = Math.ceil(num.value / chunkSize)
        let chunkIndex = 0
        const name = `render ${num.value}:`
        console.time(name)
        function render() {
            if (chunkIndex <= chunkCount) {
                const chunks = nodes.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize)
                graph.addNodes(chunks)
                renderCount.value = graph.getNodes().length
                chunkIndex++
                requestAnimationFrame(render)
            } else {
                console.timeEnd(name)
            }


        }
        render()

    }
```
requestAnimationFrame 可以通过[caniuse.com](https://caniuse.com/?search=import.meta) 判断浏览器是否支持
## requestAnimationFrame 不支持时可以才用降级方案
requestAnimationFrame 大概会在 16Hz 渲染处理，可以使用setTimeout 作为降级方案处理
```ts
const requestAnimationFrame = (cb => setTimeout(cb, 1000/60))
```
