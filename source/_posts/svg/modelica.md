---
title: modelica图形化处理方案
date: 2025-11-09 08:58:05
tags: modelica
---
# 背景
将Openmodelica 客户端UI图形化转为web图形化,使用web图形化有两种技术方案
1. 通过svg
2. canvas

目前绘图验证可以优先采用svg,使用开源库antv/x6快速验证

# DEMO验证步骤
## 问题
1. OPENMODLICA图形为笛卡尔积直角坐标系，需要转换为web坐标系
2. OPENMODLICA图形存在旋转，反转等变换，需要通过计算处理。
3. 

