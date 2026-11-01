import dns from 'node:dns'
import mongoose from 'mongoose'

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
}

global.mongooseCache = cached

export async function connectToDatabase() {
  const mongodbUri = process.env.MONGODB_URI

  if (!mongodbUri) {
    throw new Error('Please define the MONGODB_URI environment variable')
  }

  if (cached.conn) return cached.conn

  if (!cached.promise) {
    if (mongodbUri.startsWith('mongodb+srv://')) {
      const servers = dns.getServers()
      if (servers.length === 0 || servers.every((s) => s === '127.0.0.1' || s === '::1')) {
        dns.setServers(['8.8.8.8', '1.1.1.1'])
        dns.promises.setServers(['8.8.8.8', '1.1.1.1'])
      }
    }

    cached.promise = mongoose
      .connect(mongodbUri, {
        bufferCommands: false,
      })
      .catch((error) => {
        cached.promise = null
        throw error
      })
  }

  cached.conn = await cached.promise
  return cached.conn
}

export function isTransactionUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('transaction numbers are only allowed on a replica set') ||
    message.includes('transactions are not supported') ||
    (error as { code?: number }).code === 20
  )
}
