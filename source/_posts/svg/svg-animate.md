---
title: svg 动画
date: 2023-09-10 10:38:39
tags: svg
category: SVG
---

# svg 动画
[动画参考资料链接链接](https://css-tricks.com/guide-svg-animations-smil/) https://css-tricks.com/guide-svg-animations-smil/

## SVG dasharray 
stroke-dasharray 属性可以设置线段绘制时的间隔
stroke-dasharray 数值型值 可以配置2个，第二个值缺省
- stroke-dasharray="4" 代表dash 值和offset间距保持一直
- stroke-dasharray="4 5"  dash宽度为4，每一块间距为5

```html
<svg version="1.1"
     baseProfile="full"
     width="100%" height="100%"
     xmlns="http://www.w3.org/2000/svg">
    <path d="M0, 200, L200, 200, L400, 200" stroke="green" stroke-width="6"></path>
    <path d="M0, 250, L200, 250, L400, 250" stroke="green" stroke-dasharray="2" stroke-width="6"></path>
</svg>

```

## [stroke-dashoffset](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset)
stroke-dashoffset 指定了 dash 模式到路径开始的距离

```html
<svg version="1.1"
     baseProfile="full"
     width="100%" height="100%"
     xmlns="http://www.w3.org/2000/svg">
    <path d="M0, 200, L200, 200, L400, 200" stroke="green" stroke-width="6"></path>
    <path d="M0, 250, L200, 250, L400, 250" stroke="green" stroke-dasharray="2" stroke-width="6"></path>
    <path d="M0, 250, L200, 250, L400, 250" stroke="green" stroke-dasharray="2" stroke-dashoffset="2" stroke-width="6"></path>
</svg>

## 结合dasharray 与 stroke-dashoffset 让路径动起来
```html
<svg version="1.1"
     baseProfile="full"
     width="100%" height="100%"
     xmlns="http://www.w3.org/2000/svg">
    <path d="M0, 200, L200, 200, L400, 200" stroke="green" stroke-width="6"></path>
    <path d="M0, 250, L200, 250, L400, 250" stroke="green" stroke-dasharray="2" stroke-width="6"></path>
    
    <path d="M0, 250, L200, 250, L400, 250" stroke="green" stroke-dasharray="2" stroke-dashoffset="2" stroke-width="6">
      <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="10" fill="freeze" repeatCount="indefinite" easing="linear"></animate>
    </path>
</svg>

```
![](/img/svg/svg-1.gif)

## 模拟管道水流动动画
该动画需要通过 SVGGeometryElement的 getTotalLength 获取全部路径，通过动画设置stroke-dashoffset偏移
```vue
<template>
   <svg version="1.1"
     baseProfile="full"
     width="100%" height="100%"
     xmlns="http://www.w3.org/2000/svg">
     <path
        ref="pathEl2"
        fill="none"
        :stroke-dasharray="dashArray"
        stroke="red"
        stroke-width="6"
            d="M 10,30
            A 20,20 0,0,1 50,30
            A 20,20 0,0,1 90,30
            Q 90,60 50,90
            Q 10,60 10,30 z" >
            <!-- <animate
                attributeName="dash"
                values="0;5;0"
                dur="10s"
                repeatCount="indefinite" /> -->
            </path>

     <path
        ref="pathEl"
        fill="none"
        :stroke-dasharray="dashArray"
        :stroke-dashoffset="strokeDashoffset"
        stroke-width="6"
        stroke="green"
            d="M 10,30
            A 20,20 0,0,1 50,30
            A 20,20 0,0,1 90,30
            Q 90,60 50,90
            Q 10,60 10,30 z" >
            <animate
                attributeName="stroke-dashoffset"
                from="275"
                to="0"
                dur="4s"
                repeatCount="indefinite" />
            </path> 
</svg>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const pathEl = ref<SVGGeometryElement>()

const dashArray = ref(275)
const strokeDashoffset = ref(-275)

onMounted(() => {
    const totalLength = pathEl.value?.getTotalLength()
    console.log(totalLength)

})

</script>

<style scoped>

</style>

```
运行效果预览
![](/img/svg/svg-path-wather.gif)

其他
TODO