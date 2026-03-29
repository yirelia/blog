---
title: Nginx 常用命令
date: 2026-03-28 08:59:50
tags: 运维
---
- 检查配置
```bash
nginx -t
```
- 重载NGINX
```bash
nginx -s reload
```
- 查看 Nginx 日志：
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```
配置支持websocket 链接
```
## 设置变量
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
server {
    listen 9001;
    listen [::]:9001;
    server_name _;
    client_max_body_size 500M;
    root /etc/nginx/html/pycosim;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;

        proxy_buffering off;
    }
}
```
map 的作用是条件映射：
有 Upgrade 请求头时，给上游发 Connection: upgrade
没有 Upgrade 时，给上游发 Connection: close