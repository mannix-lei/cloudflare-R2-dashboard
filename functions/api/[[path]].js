// Cloudflare Pages Functions API 路由
import app from '../../src/index.js'

export async function onRequest(context) {
  return app.fetch(context.request, context.env, context)
}

