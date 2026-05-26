import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const indexPath = path.join(distDir, 'index.html')
const notFoundPath = path.join(distDir, '404.html')
const redirectScript = `<script>
  (function () {
    var parts = window.location.pathname.split('/').filter(Boolean)
    var stemqaIndex = parts.findIndex(function (segment) {
      return segment.toLowerCase() === 'stemqa'
    })
    var basePath = stemqaIndex >= 0 ? '/' + parts.slice(0, stemqaIndex + 1).join('/') : '/StemQA'
    var routeSegments = stemqaIndex >= 0 ? parts.slice(stemqaIndex + 1) : []
    var routePath = routeSegments.length ? '/' + routeSegments.join('/') : '/ingest'
    var target = window.location.origin + basePath + '/#' + routePath + window.location.search + window.location.hash
    if (window.location.href !== target) {
      window.location.replace(target)
    }
  })()
</script>`

await mkdir(distDir, { recursive: true })
await copyFile(indexPath, notFoundPath)
const notFoundMarkup = await readFile(notFoundPath, 'utf8')
await writeFile(notFoundPath, notFoundMarkup.replace('</head>', `  ${redirectScript}\n  </head>`), 'utf8')
