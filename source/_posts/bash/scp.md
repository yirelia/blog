---
title: win10 SCP 免密上传文件
date: 2023-09-16 09:41:30
tags: script
category: 脚本
---

1. 生成 Generate SSH Keys
```BASH
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```
一般默认存储到的 `~/.ssh/id_rsa`
2. 复制制定的公钥到到远程目录
```BASH
ssh-copy-id -i ~/.ssh/id_rsa.pub remote_user@remote_host
```
3. 通过scp 命令上传文件
```BASH
scp -r xxx/* -p 22 remote_user@remote_host:/path/to/remote/directory
```