import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const indexPath = path.join(distDir, 'index.html')
const notFoundPath = path.join(distDir, '404.html')

await mkdir(distDir, { recursive: true })
await copyFile(indexPath, notFoundPath)
