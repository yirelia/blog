---
title: node.js 部署脚本
date: 2023-09-26 13:40:23
tags: javascript
---
# node.js 自动打包&&部署脚本

## 搭建项目
> 采用 ES module 用法，package.json type 需要设置为 module 
``` bash 
npm init
```

## 添加配置文件server.json
```json
{
    "host": "****",
    "username": "****",
    "password": "*****",
    "path": "****",
    "port": 22,
    "localDir": "release/",
    "backUp": false
  }

```
## 读取配置文件
```javascript
import fs from "fs";
const configFilePath = path.resolve(process.cwd(), "server.json");
const config = JSON.parse(fs.readFileSync(configFilePath));
```
## 链接服务器
安装 node-ssh 依赖
``` bash
npm i node-ssh -D
npm i ora -D 
npm i chalk -D
```

```typescript
import chalk from "chalk";
import Ora from "ora";
async function connectServer(config) {
  let spinner = Ora(chalk.cyan(`[info] connecting server....\n`)).start();
  const sshLoginParam = {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  };
//   链接
  await SSH.connect(sshLoginParam)
    .then(() => {
      spinner.succeed(chalk.green(`[info] connected server \n`));
    })
    .catch((err) => {
      spinner.fail(chalk.red(`[error] connect server failed\n`));
      console.log(err);
      process.exit(1);
    });
}
```

## 添加执行命令方法
```javascript
// cmd 需要执行的命令
// cwd 执行命令所在的目录
// await runCommand(`rm -rf test-dir`, '/home')
async function runCommand(cmd, cwd) {
  await SSH.execCommand(cmd, {
    cwd,
    // onStderr(chunk) {
    //   logError(`${cmd}, stderrChunk, ${chunk.toString("utf8")}`);
    // },
  });
}

```
## 执行推送文件到远程
```javascript
// localDir 本地文件目录
// remoteDir 远程文件目录
await SSH.putDirectory(localDir, remoteDir);
```
## child_process 开启子shell执行命令
<!-- @example spawnCommand('yarn', ['build'], process.cwd()) -->
```javascript
const spawnCommand = (command, params, cwd) => {
  return new Promise((resolve, reject) => {
    const result = spawn(command, params, {
      cwd,
      stdio: 'inherit', // 打印命令原始输出
      shell: process.platform === 'win32', // 兼容windows系统
    });

    result.on('error', (err) => {
      reject(err);
    });

    result.on('close', (code) => {
      if (code === 0) resolve();
      else reject(code);
    });
  });
};

```

# 完整示例
```js
import Ora from "ora";
import * as NodeSSH from "node-ssh";
import fs from "fs";
import * as path from "path";
import chalk from "chalk";
import  { spawn } from 'child_process';
// 根目录
const REMOTE_ROOT = "/home/simtek-cloud/front/all/html";
// 主APP目录
const MAIN_APP = `main-app`;
const SSH = new NodeSSH.NodeSSH();

const logInfo = (text) => console.log(chalk.cyan(text));
const logSuccess = (text) => console.log(chalk.green(text));
const logError = (text) => console.log(chalk.red(text));

/**
 * spawnCommand 执行shell命令
 * @param {*} command 命令 string
 * @param {*} params 参数 array
 * @param {*} cwd 工作路径
 * @example spawnCommand('yarn', ['build'], process.cwd())
 */
const spawnCommand = (command, params, cwd) => {
  return new Promise((resolve, reject) => {
    const result = spawn(command, params, {
      cwd,
      stdio: 'inherit', // 打印命令原始输出
      shell: process.platform === 'win32', // 兼容windows系统
    });

    result.on('error', (err) => {
      reject(err);
    });

    result.on('close', (code) => {
      if (code === 0) resolve();
      else reject(code);
    });
  });
};

async function runCommand(cmd, cwd) {
  await SSH.execCommand(cmd, {
    cwd,
    onStderr(chunk) {
      logError(`${cmd}, stderrChunk, ${chunk.toString("utf8")}`);
    },
  });
}

const configFilePath = path.resolve(process.cwd(), "server.json");
const config = JSON.parse(fs.readFileSync(configFilePath));

async function connectServer(config) {
  let spinner = Ora(chalk.cyan(`[info] connecting server....\n`)).start();
  const sshLoginParam = {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  };
  await SSH.connect(sshLoginParam)
    .then(() => {
      spinner.succeed(chalk.green(`[info] connected server \n`));
    })
    .catch((err) => {
      spinner.fail(chalk.red(`[error] connect server failed\n`));
      console.log(err);
      process.exit(1);
    });
}

async function deleteMainAppDir() {
  const spinner = Ora(
    chalk.cyan(`[info] delete remote dir: main-app\n`)
  ).start();
  // 删除源目录
  await runCommand(`rm -rf ${MAIN_APP}`, config.path).catch((err) => {
    spinner.fail(chalk.red("删除文件失败了"));
    console.log("[error]chmod: ", err);
  });
  spinner.succeed(chalk.green(`[info] remote dir [main-app] is deleted`));
}


/**
 * @description: 推送推送main app
 * @return {*}
 */
async function putMainAppDir() {
  const localDir = path.resolve(process.cwd(), `main-app/dist`);
  const remoteDir = `${config.path}/${MAIN_APP}`;
  const successText = `[info] push ${localDir} to ${remoteDir}\n`;
  const spinner = Ora(chalk.cyan(successText)).start();
  try {
    await SSH.putDirectory(localDir, remoteDir);
    spinner.succeed(chalk.green(successText));
  } catch (e) {
    spinner.fail(chalk.red(successText));
  }
}

/**
 * @description: 重启docker 容器
 * @return {*}
 */
async function restartDocker() {
  const spinner = Ora(chalk.cyan(`[info] restart docker\n`)).start();
  // 重启docker 容器
  try {
    await runCommand(`docker restart all`, config.path).catch((err) => {
      console.log("[error]unzip: ", err);
    });
    spinner.succeed(chalk.green(`[error] restart docker\n`));
  } catch (e) {
    spinner.fail(chalk.red(`[error] restart docker\n`));
  }
}

async function deploy() {
  console.log(`======= 加载配置文件 ==========`);
  console.log(config);
  await spawnCommand('npm run', ['build:all'], process.cwd())
  await connectServer(config);
  // 删除目录
  await deleteMainAppDir();
  // 上传文件到指定目录
  await putMainAppDir();
  // 重启docker
  await restartDocker();
  SSH.dispose();
}

deploy();
