---
title: wasm编译处理
date: 2024-01-14 14:48:06
tags: wasm
---
## mac 端编译 wasm
1. 下载Emscripten代码到本地
```bash
# Get the emsdk repo    
git clone https://github.com/emscripten-core/emsdk.git

# Enter that directory    
cd emsdk
```
2. 安装最新的工具
```bash

# Download and install the latest SDK tools.    
./emsdk install latest

# Make the "latest" SDK "active" for the current user. (writes .emscripten file)    
./emsdk activate latest

# Activate PATH and other environment variables in the current terminal    
source ./emsdk_env.sh 
```
b. 一个可以运行WebAssembly的浏览器
目前各大主流浏览器都已经支持webassembly，包括：chrome、edge、safari、firefox、opera。除了，emmm，IE。只需要将浏览器升级到新版本，并且开启相应的配置即可。

c. 一个简单的C语言程序
这里使用C语言编写一个简单的helloworld程序：
```bash
#include <stdio.h>

int main() {
    printf("Hello, world!");
    return 0;
}
```
2. 编译C代码到webassembly
使用emscripten工具将C代码编译为WebAssembly。编译完成后，会得到三个新文件，分别以.html，.js和.wasm结尾。
```bash
# Compile c file to wasm file
emcc hello.c -s WASM=1 -s FORCE_FILESYSTEM=1 -s EXIT_RUNTIME=1 -o hello.html
```
3. 运行
启动一个文件服务器，使用浏览器打开localhost:8080/hello.html文件，看到控制台显示"Hello, world!"，表示构建成功。

启动文件服务器
```bash
# Start file server    
emrun --no_browser --port 8080 .
```
2. 浏览器打开http://localhost:8080/hello.html 

