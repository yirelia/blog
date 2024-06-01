---
title: LRU 缓存算法
date: 2024-04-15 21:57:55
tags: algorithm
category: 算法题
---

# JS模拟LRU算法，get && put 通过O(1)
```ts
class LRUCache {
    constructor(capacity: number) {
        this.cacapacity = capacity
        this.map = new Map()
        this.n = 0
        this.head = new DLinkedNode()
        this.tail = new DLinkedNode()

    }

    get(key: number): number {
        const node = this.map.get(key)
        return node ? node.val : -1
    }

    put(key: number, value: number): void {
        const node = this.map.get(key)
        if(node) {
            node.pre.next = node.next
            this.head.next.pre = node
            this.head.next = node
        } else {
            const node = new DLinkedNode(value)
            this.head.next.pre = node
            this.head.next = node
            this.map.set(key, node)
            this.n + =1
            if(this.n > this.cacapacity) {
                this.tail.pre.pre.next = this.tail
                this.map.delete(key)
            }
        }
    }
}

class DLinkedNode {
    constructor(val, pre?, next?) {
        this.val = val
        this.pre = pre
        this.next = next
    }
}

```