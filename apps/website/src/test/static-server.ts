import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
}

/**
 * Serves a built folder the way a static host would, including the 404 page, on a
 * free port. Resolves to the server and the origin it listens on.
 */
export async function serveBuild(outDir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://site.invalid').pathname)
    const file = normalize(join(outDir, path.endsWith('/') ? `${path}index.html` : path))
    if (!file.startsWith(`${outDir}${sep}`)) return void response.writeHead(400).end()
    try {
      const body = await readFile(file)
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      })
      response.end(body)
    } catch {
      response.writeHead(404, { 'content-type': TYPES['.html'] })
      response.end(await readFile(join(outDir, '404.html')))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { server, origin: `http://127.0.0.1:${port}` }
}
