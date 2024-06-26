---
title: JS 实现队列
date: 2020-10-26 18:34:16
tags: 数据结构
---

记录下学习算法中数据结构, 通过 JS 方式来实现一些数据结构

# 队列
## 队列作用场景

队列是一种常用的数据结构，它具有 __先进先出（FIFO)__ 的特点。因此，队列在以下场景中非常有用：

1. 任务调度：当有多个任务需要按照顺序执行时，可以使用队列来管理任务的执行顺序。

2. 消息传递：在消息传递系统中，消息可以按照顺序放入队列中，然后按照先进先出的原则进行处理。

3. 广度优先搜索：在图算法中，广度优先搜索常常使用队列来管理待访问的节点。

4. 缓冲区管理：队列可以用于管理缓冲区，例如网络数据包的传输、打印任务的排队等。

总之，队列在需要按照顺序处理数据的场景中非常有用。


# 栈的API设计

```ts
export class Queue<T> {
    public collection:T[]

    constructor() {
        this.collection = []
    }

    public enqueue(item: T) {
        this.collection.unshift(item)
    }

    public dequeue(): T | undefined {
        return this.collection.pop()
    }

    public isEmpty() {
        return this.collection.length === 0
    }

    public size() {
        return this.collection.length
    }
}
```
# 队列示例
```ts
    function mkJob(name) {
        return {
            name
        }
    }

    function main() {
        const jobQueue = new Queue()
        for(let i = 0; i< 4; i++) {
            jobQueue.enqueue(mkJob(`job_${i}`))
        }
        while(!jobQueue.isEmpty()) {
            const job = jobQueue.dequeue()
            console.log(`handle job: ${job.name}`)
        }

    }
```