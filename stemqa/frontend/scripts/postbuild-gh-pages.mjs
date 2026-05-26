import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const indexPath = path.join(distDir, 'index.html')
const notFoundPath = path.join(distDir, '404.html')

if (!process.env.VITE_API_BASE_URL) {
  console.error('Set VITE_API_BASE_URL to your Render backend URL before running the GitHub Pages deploy build.')
  process.exit(1)
}

await mkdir(distDir, { recursive: true })
await copyFile(indexPath, notFoundPath)
