---
title: 搜索插入位置
date: 2023-12-05 21:57:55
tags: algorithm
category: 算法题
---

# [力扣](https://leetcode.cn/problems/search-insert-position/description/)
请必须使用时间复杂度为 O(log n) 的算法。
给定一个排序数组和一个目标值，在数组中找到目标值，并返回其索引。如果目标值不存在于数组中，返回它将会被按顺序插入的位置。

请必须使用时间复杂度为 O(log n) 的算法。

```js

const searchInsert = function(nums, target) {
    //  区间左开右闭 [left, right]
    let left = 0;
    let right = nums.length - 1
    while(left <= right) {
        let mid = Math.floor((left + right) / 2)
        if(nums[mid] === target) {
            return mid
        } else if(nums[mid] < target) {
            left = mid + 1
        } else {
            right = mid - 1
        }
    }
    return right + 1
};

```