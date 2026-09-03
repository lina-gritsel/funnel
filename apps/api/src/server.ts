import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001)
const host = process.env.API_HOST ?? '0.0.0.0'
const databasePath = process.env.SQLITE_PATH
const app = buildApp({
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  ...(databasePath ? { databasePath } : {})
})

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
