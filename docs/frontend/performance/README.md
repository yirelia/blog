# 性能优化

## 1 数据访问

JavaScript中有四种基本的数据存取位置：
- 直接量
  直接量只代表自身，不存储在特定位置。JavaScript中的直接量有：字符串，数字，布尔值，对象，数组，函数，正则表达式，以及特殊的null和undefined值。
  
- 变量
  开发人员用关键字var定义的数据存储单元。
  
- 数组元素
 存储在JavaScript数组对象内部，以数字作为索引。

- 对象成员
  存储在JavaScript对象内部，以字符串作为索引。

每一种数据储存的位置都有不同的读写消耗。总的来说，直接量和局部变量的访问速度快于数组项和对象成员的访问速度，如果在乎运行速度，那么尽量使用直接量和局部变量，减少数组项和对象成员的使用。为此，有几种模式来寻找和规避问题，以及优化你的代码。

### 1.1  管理作用域

#### 1.1.1 作用域链和标识符解析

每一个JavaScript函数都表示为一个对象，更确切地说，是Function对象的一个实例。Function 对象同其他对象一样，拥有可以编程访问的属性，和一系列不能通过代码访问而仅供JavaScript引擎存取的内部属性。其中一个内部属性是[[Scope]]，由ECMA-262标准第三版定义。

- 访问局部作用域变量

在运行期上下文的作用域链中，一个标识符所在的位置越深，它的读写速度也就越慢。因此，函数中读写局部变量总是最快的，而读写全局变量通常是最慢的（优化JavaScript引擎在某些情况下能有所改善）。请记住，全局变量总是存在于运行期上下文作用域链的最末端，因此它也是最远的,
```js 
//  例如document 引用
const getElement = () => {
  const submitBtn = documnet.getElementId('submitBtn')
  const cancel = docment.getElementId('cancel')
  ....

}
// 其中 docment 属于全局变量，需要从对象原型的的原型中搜索，嵌套比较深
// 可以将docment 复制给局部变量doc, 提高变量检索速度

const getElement = () => {
  const doc = docment
  const submitBtn = doc.getElementId('submitBtn')
  const cancel = doc.getElementId('cancel')
  ....

}

```
#### 1.1.2 缓存对象成员值
通常来说，在函数中如果要多次读取同一个对象属性，最佳做法是将属性值保存到局部变量中。局部变量能用来替代属性以避免多次查找带来的性能开销。特别是在处理嵌套对象成员时，这样做会明显改善执行速度
例如：
```js
 function hasEitherClass(element, className1, className2) {
   return element.className === className1 || element.className === className2
 }

 // 将对象属性缓存为局部变量
 function hasEitherClass(element, className1, className2) {
   const className = element.className
   return className === className1 ||className === className2
 }

```
在JavaScript中，数据存储的位置会对代码整体性能产生重大的影响。数据存储共有4种方式：直接量、变量、数组项、对象成员。它们有不同的性能考虑。
● 访问直接量和局部变量的速度最快，相反，访问数组元素和对象成员相对较慢。
● 由于局部变量存在于作用域链的起始位置，因此访问局部变量比访问跨作用域变量更快。变量在作用域链中的位置越深，访问所需时间就越长。由于全局变量总处在作用域链的最末端，因此访问速度也是最慢的。

## 2、DOM

- 重排(reflow)

  当页面布局和几何属性改变时就需要“重排”。下述情况中会发生重排：
  - 添加或删除可见的DOM元素
  - 元素位置改变
  - 元素尺寸改变（包括：外边距、内边距、边框厚度、宽度、高度等属性改变）
  - 内容改变，例如：文本改变或图片被另一个不同尺寸的图片替代
  - 页面渲染器初始化
  - 浏览器窗口尺寸改变
  根据改变的范围和程度，渲染树中或大或小的对应的部分也需要重新计算。有些改变会触发整个页面的重排：例如，当滚动条出现

- 重绘(repaint)

  完成重排后，浏览器会重新绘制受影响的部分到屏幕中，该过程称为“重绘（repaint)”

 

#### 优化重排

1. 一个能够达到同样效果且效率更高的方式是：合并所有的改变然后一次处理，这样只会修改DOM一次。使用cssText属性可以实现


```js
const el=document.getElementById('mydiv');
el.style.cssText='border-left: 1px; border-right: 2px; padding: 5px;';
```
例子中的代码修改cssText属性并覆盖了已存在的样式信息，因此如果想保留现有样式，可以把它附加在cssText字符串后面。

```js
el.style.cssText+='; border-left: 1px';
```

2.直接更改CSS类名

```js
var el=document.getElementById('mydiv');
el.className= 'active';
```

3、批量修改DOM
  当你需要对DOM元素进行一系列操作时，可以通过以下步骤来减少重绘和重排的次数：

1. 使元素脱离文档流
2. 对其应用多重改变
3.  把元素带回文档中，该过程里会触发两次重排——第一步和第三步。如果你忽略这两个步骤，那么在第二步所产生的任何修改都会触发一次重排。
   有三种基本方法可以使DOM脱离文档：
   - 隐藏元素，修改应用，重新显示。
   - 使用文档片断（docuement fragment）在当前DOM之外构建一个子树，再把它拷贝回文档。
   - 将原始元素拷贝到一个脱离文档的节点中，修改副本，完成后再替换原始元素。

example:

```html
<ul id="myList">
    <li herf="http://baidu.com"></li>
    <li herf="http://google.com"></li>
</ul>
```



