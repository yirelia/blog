---
title: JS 实现栈
date: 2020-10-25 15:34:16
tags: 数据结构
---

记录下学习算法中数据结构, 通过 JS 方式来实现一些数据结构

# 栈
栈 后进先出结构，主要应用场景
栈主要应用于以下场景：
1. 表达式求值：栈可以用于实现表达式求值算法，如中缀表达式转后缀表达式并计算结果。
2. 函数调用：栈可以用于保存函数调用的上下文信息，包括参数、返回地址等。
3. 浏览器历史记录：浏览器的后退功能可以通过栈来实现，每次访问新页面时将页面地址入栈，后退时将栈顶元素出栈。
4. 撤销操作：编辑器、图形软件等可以使用栈来实现撤销操作，每次操作将操作记录入栈，撤销时将栈顶操作出栈。
5. 括号匹配：栈可以用于检查表达式中的括号是否匹配，遇到左括号入栈，遇到右括号出栈并检查是否匹配。

# 栈的API设计

```ts
class Stack<T extends unknown = any> {
    private collection: T[]
    constructor() {
        this.collection = []
    }

    public push(item: T) {
        this.collection.push(item)
    }

    public pop(): T | undefined {
        return this.collection.pop()
    }

    /**
     * @description: 是否为空
     * @return {*}
     */    
    public isEmpty() {
        return this.collection.length === 0
    }

    /**
     * @description: 获取当前栈大小
     * @return {*}
     */    
    public size() {
        return this.collection.length
    }

    public clear() {
        this.collection.length = 0
    }
}
```