---
title: SVG 坐标系
date: 2023-10-09 09:22:48
tags:
---

参考资料
- SVG：可缩放矢量图形 | MDN
- Understanding SVG Coordinate Systems and Transformations (Part 1) — The viewport, viewBox, and prese
- Coordinate Systems, Transformations and Units — SVG 2
- A Guide to SVG Animations (SMIL) | CSS-Tricks
##Svg 画布
画布(canvs)是绘制 SVG 内容的空间或区域。从概念上讲，这块画布在两个维度(X轴, Y轴)上都是无限的。因此，SVG 可以是任意大小。然而，它是相对于称为视口(viewport)的有限区域在屏幕上渲染的。超出视口边界的 SVG 区域将被剪掉并且不可见。
视口（viewport）
视口是 SVG 画布的可见区域. 整个 SVG 画布或部分画布是否可见取决于该cavas的大小和preserveAspectRatio 属性的值。
```html
<!-- the viewport will be 800px by 600px -->
<svg width="800" height="600">
        <!-- SVG content drawn onto the SVG canvas -->
</svg>
```
在 SVG 中，可以使用或不使用单位标识符来设置值。无单位值据说是使用用户单位在用户空间中指定的。如果以用户单位指定值，则假定该值等于相同数量的“px”单位。这意味着上例中的视口将渲染为 800px x 600px 视口。您还可以使用单位指定值。 SVG 中支持的长度单位标识符有：em、ex、px、pt、pc、cm、mm、in 和百分比。一旦设置了最外层 SVG 元素的宽度和高度，浏览器就会建立 __初始视口坐标系(viewport coordinate system)__ 和 __初始用户坐标系(initial user coordinate system.)__

## 初始化坐标系
初始视口坐标系是在视口上建立的坐标系，原点位于视口左上角的点(0, 0)，x轴正方向向右，y轴正方向向下，初始坐标系中的一个单位等于视口中的一个“像素”。这个坐标系类似于用CSS盒模型在HTML元素上建立的坐标系。
初始用户坐标系是在SVG画布上建立的坐标系。该坐标系最初与视口坐标系相同 - 它的原点位于视口的左上角，正 x 轴指向右侧，正 y 轴指向下方。使用 viewBox 属性，可以修改初始用户坐标系（也称为当前坐标系或使用中的用户空间），使其不再与视口坐标系相同
![](/img/svg/svg初始坐标系.PNG)

## SVG 坐标系变换
Transform 属性值
Transform 属性给元素指定一个或多个变换。它采用 <transform-list> 作为值，该值被定义为变换定义列表，这些变换定义按提供的顺序应用。各个转换定义由空格或逗号分隔。对元素应用转换的示例可能如下所示：

Svg 变换包含以下几种：__旋转（rotation）__、__缩放（scaling）__、__平移（translation）__ 和 __倾斜（skewing）__。 Transform 属性中使用的转换函数的工作方式与 Transform 属性中的 CSS 转换函数的工作方式类似，只是它们采用不同的参数。

### 矩阵 （Matrix）
你可以通过matrix() 方法来将一个或多个变换应用到element 上. Martix 语法如下：
``` js 
matrix(<a> <b> <c> <d> <e> <f>)

<g transform="matrix(1 ,0, 0,1, 0,0)"></g>
```
除特别精通数学，一般不建议使用， 更多信息可参考 [w3网址](https://www.w3.org/TR/SVG/coords.html#VectorEffectsCalculation)
### 平移（Translation）
想要移动一个svg 元素，可以使用 translate() 函数，语法如下：
```js
translate(<tx> [<ty>])
```
translate() 接受一个或两个值，分别指定水平和垂直移动。 tx表示沿x轴的平移值； ty 表示沿 y 轴的平移值。
ty 值是可选的；如果省略，则默认为零。 tx 和 ty 值可以以空格分隔或以逗号分隔，并且它们在函数内无需任何单位 - 它们默认为用户当前坐标系单位。
以下示例将圆向右平移 100 个用户单位，向下平移 300 个用户单位：
```js
<circle cx="0" cy="0" r="100" transform="translate(100 300)" />
```
如果使用 translate(100, 300) （其中值以逗号分隔），则上面的示例仍然有效。
### 缩放（Scaling）
您可以使用scale()函数转换来放大或缩小SVG元素。缩放变换的语法是：
scale(<sx> [<sy>])
scale() 函数接收一个或两个值，分别指定水平和垂直缩放值。 sx表示沿x轴的缩放值，用于水平拉伸或收缩元素； sy 表示沿 y 轴的缩放值，用于垂直拉伸或收缩元素。
sy 值是可选的；如果省略，则假定等于 sx。 sx 和 sy 值可以用空格分隔，也可以用逗号分隔，并且它们是无单位的数字。
以下示例通过将元素缩放到原始大小的两倍来将元素的大小加倍：
```html
<rect width="150" height="100" transform="scale(2)" x="0" y="0" />
```
以下代码将元素水平放大为原来2倍，垂直缩小为原来的一半：
```html
<rect width="150" height="100" transform="scale(2 0.5)" x="0" y="0" />
```
如果使用scale(2, .5)（其中值以逗号分隔)，则上面的示例仍然有效。
这里需要注意的是，当缩放 SVG 元素时，其整个当前坐标系也会缩放，导致该元素也在视口内重新定位。
### 倾斜（Skew）
SVG 元素也可以倾斜。通过两个函数：skewX 和 skewY实现倾斜操作。
```js
skewX(<skew-angle>)
skewY(<skew-angle>)
```
skewX 函数指定沿 x 轴的倾斜变换； skewY 函数指定沿 y 轴的倾斜变换。
指定的倾斜角度是无单位角度，默认为度。
请注意，倾斜元素可能会导致元素在视口内重新定位
### 旋转（Rotation）
您可以使用rotate()函数旋转SVG元素。该函数的语法是：
```js
rotate(<rotate-angle> [<cx> <cy>])
```
rotate() 可设置指定点，指定角度进行旋转。与 CSS 中的旋转变换不同，您不能指定度以外的角度单位。角度值指定为无单位，默认情况下被视为度值。
可选的 cx 和 cy 用于设置旋转中心，无单位值。如果未提供 cx 和 cy，则旋转围绕当前用户坐标系的原点
在rotate()函数中指定旋转中心就像CSS中设置transform:rotate()和transform-origin的简写方式。由于 SVG 中的默认旋转中心是当前使用的用户坐标系的左上角，并且这可能不允许您创建所需的旋转效果，因此您最终可能会在rotate() 中指定一个新的中心。如果您知道元素在 SVG 画布中的尺寸和位置，则可以轻松地将其中心指定为旋转中心。
以下示例围绕当前用户坐标系中位于 (50, 50) 的指定旋转中心旋转一组元素：
```html
<g id="parrot" transform="rotate(45 50 50)" x="0" y="0">
        <!-- elements making up a parrot shape -->
</g>
```
但是，如果你希望元素绕其中心旋转，你可能想将中心指定为 50% 50%，就像在 CSS 中所做的那样；但不幸的是，在rotate()函数内部这样做是不可能的——必须使用绝对坐标。但是，你可以结合使用 CSS 变换源属性和 CSS 变换属性来执行此操作
### 坐标系变换
现在我们已经涵盖了 SVG所有的变换方法 ，我们深入到SVG元素应用变换后的视觉变化。这将是SVG 变换最重要的部分。这将是它们被称为“坐标系变换”而不仅仅是“元素变换”原因。
在这个规范中，transform 属性被定义可为元素建立新用户空间（当前坐标系）的两个属性之一 - viewBox 属于另外一个。那么这到底代表什么呢？
The transform attribute establishes a new user space (current coordinate system) on the element it is | applied to.
此行为类似于应用于 HTML 元素的 CSS 转换的行为 — HTML 元素的坐标系被转换，当连续转换时通常最为明显（我们稍后会介绍）。尽管 HTML 和 SVG 转换在许多方面相似，但它们还是存在一些差异。
主要区别在于坐标系。 HTML 元素的坐标系是建立在元素本身上的。同时，在 SVG 中，元素的坐标系最初是当前使用的坐标系或用户空间。
当您将变换属性应用于 SVG 元素时，该元素将获得当前使用的用户坐标系的“副本”。您可以将其视为只是为转换后的元素创建一个新的“图层”，其中新图层有自己的当前用户坐标系（viewBox）的副本。
然后，元素的新当前坐标系通过已经被元素的transfrom 指定属性变换了 ，从而导致元素本身的变换。就好像元素被绘制到变换后的坐标系中的画布上一样。
要了解如何应用 SVG 转换，让我们从视觉部分开始。下图显示了我们将要使用的 SVG 画布。
![](/img/svg/svg初始坐标系.png)

鹦鹉和狗是我们要转换的元素（组 <g>）。
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <g id="parrot">
                <!-- shapes and paths forming the parrot -->
        </g>
        <g id="dog">
                <!-- shapes and paths forming the dog -->
        </g>
</svg>
```
灰色坐标系是viewBox建立的画布的初始坐标系。为了简单起见，我不会更改初始坐标系 - 我使用与视口大小相同的 viewBox，如上面的代码所示。
When you apply the transform attribute to an SVG element, that element gets a "copy" of the current user coordinate system in use.
现在我们已经建立了画布和初始用户空间，我们将开始转换元素。我们首先将鹦鹉向左平移 150 个单位，向下平移 200 个单位。
当然，鹦鹉是由多种路径和形状组成的。将 Transform 属性应用于包裹这些形状的组 <g> 就足够了；这会将g 下的所有形状都做同等变换。有关详细信息，请参阅有关构建和分组 SVG 的文章。
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <g id="parrot" transform="translate(150 200)">
                <!-- shapes and paths forming the parrot -->
        </g>
        <!-- ... -->
</svg>
```
下图展示了通过上面的变换来平移鹦鹉。鹦鹉的半透明版本显示应用变换之前的初始位置。
![](/img/svg/translate-150-200.png)
Svg 应用变换后的效果和HTML元素应用了CSS 变换效果一致 。我们之前提到过，元素基于transfrom 属性会建立一个新的当前用户坐标系。下图在 鹦鹉元素在变换后建立的初始坐标系的“副本”。注意鹦鹉当前的坐标系是如何平移的。
![](/img/svg/平移对比.png)
这里需要注意的是，在元素上建立的新当前坐标系是初始用户空间的复制，其中保留了元素的位置。这意味着它不是建立在元素的边界上，新的当前坐标系的大小也不受元素大小的限制。这就是 HTML 和 SVG 坐标系之间的差异所在。
现在让我们尝试别的东西。我们要把鹦鹉放大一倍：
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <g id="parrot" transform="scale(2)">
                <!-- shapes and paths forming the parrot -->
        </g>
        <!-- ... -->
</svg>
```
缩放 SVG 元素的结果与缩放 HTML 元素的结果不同。缩放后的 SVG 元素的位置在视口内发生变化。下图显示了将鹦鹉的尺寸放大一倍的结果。注意初始位置和大小，以及最终大小和位置。
![](/img/svg/放大一倍.png)
从上图中我们可以注意到，不仅鹦鹉的尺寸（宽度和高度）增加了一倍，而且坐标（x和y）也乘以缩放因子（这里是2）
我们最终得到这个结果的原因是我们之前提到的：元素当前的坐标系被转换，然后鹦鹉被绘制到新的系统中。因此，在本例中，当前坐标系已缩放。此效果类似于使用 viewBox = "0 0 400 300" 的效果，它“放大”到坐标系，从而将其中内容的大小加倍
因此，如果我们将鹦鹉变换后的当前坐标系绘制出来，我们将得到以下结果：
![](/img/svg/大小加倍.png)
鹦鹉的新当前坐标系被放大，同时“放大”到鹦鹉。请注意，在当前坐标系内，鹦鹉不会重新定位，只是缩放坐标系的效果将其在视口内重新定位。鹦鹉被放大后的坐标系中以其原始 x 和 y 坐标绘制。
让我们尝试使用不同的缩放因子在两个方向上缩放鹦鹉。如果我们通过应用transform="scale(2 0.5)来缩放鹦鹉，我们会将其宽度加倍，同时使其高度为原始高度的一半。效果将类似于应用viewBox="0 0 400 1200"。
![](/img/svg/viewBox放大.png)
注意鹦鹉在缩放坐标系内的位置，并将其与初始系统（半透明鹦鹉）中的位置进行比较：x 和 y 位置坐标被保留。
倾斜 SVG 中的元素也会导致该元素因其当前坐标系倾斜而被“移动”。
假设我们使用 skewX 函数沿 x 轴对狗应用倾斜变换。我们要将狗水平倾斜 25 度。
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <!-- ... -->
        <g id="dog" transform="skewX(25)">
                <!-- shapes and paths forming the dog -->
        </g>
</svg>
```
下图显示了对狗应用倾斜变换的结果。它的坐标系是倾斜，所以小狗也是倾斜的
![](/img/svg/x轴倾斜.png)
请注意，由于坐标系倾斜，狗的位置相对于其原始位置也会发生变化。
下图显示了使用 skewY() 而不是 skewX 将狗倾斜相同角度的结果：
![](/img/svg/Y轴倾斜.png)
，让我们尝试旋转鹦鹉。默认旋转中心是当前用户坐标系的左上角。建立在旋转元素上的新的当前系统也将被旋转。在下面的示例中，我们将把鹦鹉旋转 45 度。正旋转方向为顺时针方向。
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <g id="parrot" transform="rotate(45)">
                <!-- shapes and paths forming the parrot -->
        </g>
        <!-- ... -->
</svg>
```
上述转换的结果如下所示：
![](/img/svg/无中心点旋转.png)
除了坐标系的默认原点外，你可能还想围绕某个点旋转某个元素。使用 transform 属性中的 rotate() 函数，可以明确指定该点。假设我们要将本示例中的鹦鹉围绕其中心旋转。根据鹦鹉的宽度、高度和位置，我可以确定它的中心大约在（150，170）处。然后就可以围绕这一点旋转鹦鹉：
```html
<svg width="800" height="800" viewBox="0 0 800 600">
        <g id="parrot" transform="rotate(45 150 170)">
                <!-- shapes and paths forming the parrot -->
        </g>
        <!-- ... -->
</svg>
```
此时，鹦鹉被旋转，看起来就像这样：
![](/img/svg/指定点旋转.png)
我们说过，变换是作用于坐标系，因此元素最终也会受到影响并发生变换。那么，对于原点位于点（0，0）的坐标系来说，改变旋转中心究竟是如何起作用的呢？
当你更改旋转中心时，坐标系先平移，再旋转指定角度，然后根据您指定的旋转中心再次平移特定值。在本示例中
```html
<g id="parrot" transform="rotate(45 150 170)">
```        
浏览器通过执行了一系列的平移和旋转操作相当于：
```html
<g id="parrot" transform="translate(150 170) rotate(45) translate(-150 -170)">  
```      
当前坐标系将平移到你设置的中心点。然后它会根据你指定角度进行旋转。最后，在反向平移回来。上述变换视觉效果如下
![](/img/svg/平移-旋转-平移.png)
在进入下一节嵌套和链式变换之前，我想指出的是，每一个元素通过变换后的用户坐标系之间都是相互独立的。下图显示了在狗和鹦鹉上建立的两个坐标系，以及它们是如何相互独立的。
![](/img/svg/坐标系独立.png)
另请注意，每个当前坐标系都隶属于<svg> 上的 viewBox 属性建立的画布的主坐标系内，viewBox 的任何变换都会影响整个画布及其内部的所有元素，无论它们是否有自己建立的坐标系。
例如，下面是将整个画布的用户空间从 viewBox="0 0 800 600" 更改为 viewBox="0 0 600 450" 的结果。整个画布被放大，同时保留每个元素原有的变换
![](/img/svg/放大.png)
对比上面的图片看一下
![](/img/svg/viewbox对比.png)
嵌套和链式转换
很多时候你可能想要对一个元素应用多个转换。在原始元素上应用多个转换就是所谓的“链式”转换。
当应用链式变换时，需要注意的是:像 HTML 元素变换一样，每个变换都是基于前一次变换后的用户坐标系进行变换。
例如，元素要先旋转在平移，则平移将根据旋转后的新的坐标系进行，而不是初始的非旋转坐标系。
下面的例子就是这样做的。我们应用之前的旋转，然后沿正 x-axistransform="rotate(45 150 170) translate(200)" 将鹦鹉平移 200 个单位。
![](/img/svg/嵌套链式链式转换.png)
