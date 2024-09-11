---
title: Bash常用命令
date: 2024-09-4 10:38:39
tags: BASH
category: Linux
---

## ssh 远程登录
```bash
 ssh usename@host -p ${port}
```

## scp 上传文件
```bash
scp -P ${port} ${localfile} ${usename}@${remote-host}:${remote-dir}
```

## zip 加密压缩
```
zip -er ${filename}.zip ${dir}
```

## unzip 解压命令
```bash
 unzip ${zipFileName}.zip -d ${targetDir}
```
