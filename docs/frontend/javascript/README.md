# 通用的下载文件方法
```js
function downloadFileByBlob (blob, filename) {
  const videoURL = URL.createObjectURL(blob)
  const aLink = document.createElement('a')
  document.body.appendChild(aLink)
  aLink.download = filename
  aLink.href = objectUrl
  aLink.click()
  document.body.removeChild(aLink)
  window.URL.revokeObjectURL(videoURL )
}

```

```js
// 下载视频
fetch(url).then(response => {
 response.arrayBuffer().then(res => {
 	     const type = 'video/*' //  视频类型
        const blob = new Blob([res], { type: type })
        downloadFileByBlob(blob, filename)
  })
})

```
```js
//  下载excel 文件，如果通过 content-disposition获取文件名需要通过 后端配置暴露 content-disposition 属性
      const reg = /.+filename=(.+)/
      const fileName = response.headers['content-disposition'].match(reg)[1]
      downLoadBlob(response.data, decodeURI(fileName))
```