import { buildApp } from './app.js'

const port = Number(process.env.API_PORT ?? 3001)
const host = process.env.API_HOST ?? '0.0.0.0'
const app = buildApp()

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
