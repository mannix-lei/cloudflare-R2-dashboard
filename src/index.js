// Cloudflare Workers 入口文件
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// 中间件
app.use('*', logger())
app.use('*', cors())

// 静态文件服务
app.use('/static/*', serveStatic({ root: './' }))

// R2 配置
const getR2Config = (env) => ({
  bucket_name: env.R2_BUCKET_NAME || 'mannix',
  access_key_id: env.R2_ACCESS_KEY_ID,
  access_key_secret: env.R2_ACCESS_KEY_SECRET,
  endpoint: env.R2_ENDPOINT,
  draft_domain: env.DRAFT_DOMAIN
})

// 工具函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 首页路由
app.get('/', async (c) => {
  try {
    const env = c.env
    const config = getR2Config(env)
    const prefix = c.req.query('prefix') || ''

    // 使用 R2 绑定
    const bucket = env.R2_BUCKET
    const objects = await bucket.list({ prefix, delimiter: '/' })

    // 处理文件夹和文件
    const folders = objects.delimitedPrefixes?.map(prefix => ({
      name: prefix.replace(prefix, '').replace('/', ''),
      prefix: prefix,
      type: 'folder'
    })) || []

    const files = objects.objects?.filter(obj => !obj.key.endsWith('/')).map(obj => ({
      name: obj.key.replace(prefix, ''),
      key: obj.key,
      size: obj.size,
      lastModified: obj.uploaded.toISOString(),
      url: `${config.draft_domain}/${obj.key}`,
      type: 'file'
    })) || []

    const breadcrumbs = prefix ? prefix.split('/').filter(Boolean).map((part, index, array) => ({
      name: part,
      prefix: array.slice(0, index + 1).join('/') + '/'
    })) : []

    // 返回 HTML 页面
    const html = await generateHTML({
      folders,
      files,
      currentPrefix: prefix,
      breadcrumbs,
      domain: config.draft_domain
    })

    return c.html(html)
  } catch (error) {
    console.error('Error listing objects:', error)
    return c.html(await generateErrorHTML(error.message))
  }
})

// 上传文件路由
app.post('/upload', async (c) => {
  try {
    const env = c.env
    const config = getR2Config(env)
    const bucket = env.R2_BUCKET

    const formData = await c.req.formData()
    const prefix = formData.get('prefix') || ''
    const files = formData.getAll('files')

    for (const file of files) {
      const key = prefix + file.name
      await bucket.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type
        }
      })
    }

    return c.json({ 
      success: true, 
      message: `Successfully uploaded ${files.length} file(s)` 
    })
  } catch (error) {
    console.error('Error uploading files:', error)
    return c.json({ 
      success: false, 
      message: 'Upload failed: ' + error.message 
    }, 500)
  }
})

// 删除文件路由
app.delete('/delete/:key{.*}', async (c) => {
  try {
    const env = c.env
    const bucket = env.R2_BUCKET
    const key = decodeURIComponent(c.req.param('key'))

    await bucket.delete(key)
    console.log('File deleted:', key)
    
    return c.json({ success: true, message: 'File deleted successfully' })
  } catch (error) {
    console.error('Error deleting file:', error)
    return c.json({ 
      success: false, 
      message: 'Delete failed: ' + error.message 
    }, 500)
  }
})

// 创建文件夹路由
app.post('/create-folder', async (c) => {
  try {
    const env = c.env
    const bucket = env.R2_BUCKET
    const { folderName, prefix } = await c.req.json()

    if (!folderName || folderName.trim() === '') {
      return c.json({ 
        success: false, 
        message: 'Folder name is required' 
      }, 400)
    }

    const folderKey = (prefix || '') + folderName.trim() + '/'
    await bucket.put(folderKey, '', {
      httpMetadata: {
        contentType: 'application/x-directory'
      }
    })

    console.log('Folder created:', folderKey)
    return c.json({ success: true, message: 'Folder created successfully' })
  } catch (error) {
    console.error('Error creating folder:', error)
    return c.json({ 
      success: false, 
      message: 'Create folder failed: ' + error.message 
    }, 500)
  }
})

// 下载文件夹路由
app.get('/download-folder/:prefix{.*}', async (c) => {
  try {
    const env = c.env
    const bucket = env.R2_BUCKET
    const prefix = decodeURIComponent(c.req.param('prefix'))
    const folderName = prefix.split('/').filter(Boolean).pop() || 'root'

    const objects = await bucket.list({ prefix })
    
    if (!objects.objects || objects.objects.length === 0) {
      return c.json({ 
        success: false, 
        message: 'Folder is empty or does not exist' 
      }, 404)
    }

    // 注意：在 Workers 中创建 ZIP 文件需要特殊处理
    // 这里返回一个文件列表，前端可以逐个下载
    const fileList = objects.objects
      .filter(obj => !obj.key.endsWith('/'))
      .map(obj => ({
        key: obj.key,
        name: obj.key.replace(prefix, ''),
        size: obj.size
      }))

    return c.json({
      success: true,
      folderName,
      files: fileList,
      downloadUrl: `/api/download-multiple?prefix=${encodeURIComponent(prefix)}`
    })
  } catch (error) {
    console.error('Error preparing folder download:', error)
    return c.json({ 
      success: false, 
      message: 'Download preparation failed: ' + error.message 
    }, 500)
  }
})

// 测试连接路由
app.get('/api/test-connection', async (c) => {
  try {
    const env = c.env
    const config = getR2Config(env)
    const bucket = env.R2_BUCKET

    console.log('Testing R2 connection...')
    console.log('Bucket:', config.bucket_name)

    const objects = await bucket.list({ limit: 1 })
    console.log('Connection successful!')

    return c.json({
      success: true,
      message: 'Connection successful',
      bucketName: config.bucket_name,
      objectCount: objects.objects?.length || 0,
      endpoint: config.endpoint
    })
  } catch (error) {
    console.error('Connection test failed:', error)
    return c.json({
      success: false,
      error: error.name,
      message: error.message,
      details: {
        bucketName: config.bucket_name,
        endpoint: config.endpoint
      }
    })
  }
})

// HTML 生成函数
async function generateHTML({ folders, files, currentPrefix, breadcrumbs, domain }) {
  // 这里应该包含完整的 HTML 模板
  // 为了简化，这里返回一个基本的 HTML
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>R2 文件管理后台 - Cloudflare Workers</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body>
    <div class="container-fluid py-4">
        <h1><i class="fas fa-cloud me-2"></i>R2 文件管理后台</h1>
        <p class="text-muted">运行在 Cloudflare Workers</p>
        
        <!-- 面包屑 -->
        <nav aria-label="breadcrumb" class="mb-4">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="/">根目录</a></li>
                ${breadcrumbs.map((crumb, index) => 
                  index === breadcrumbs.length - 1 
                    ? `<li class="breadcrumb-item active">${crumb.name}</li>`
                    : `<li class="breadcrumb-item"><a href="/?prefix=${crumb.prefix}">${crumb.name}</a></li>`
                ).join('')}
            </ol>
        </nav>
        
        <!-- 文件列表 -->
        <div class="card">
            <div class="card-body">
                ${folders.length === 0 && files.length === 0 ? 
                  '<p class="text-center text-muted">此文件夹为空</p>' :
                  `<table class="table">
                    <thead>
                      <tr><th>名称</th><th>大小</th><th>修改时间</th></tr>
                    </thead>
                    <tbody>
                      ${folders.map(folder => 
                        `<tr onclick="location.href='/?prefix=${folder.prefix}'">
                          <td><i class="fas fa-folder text-warning me-2"></i>${folder.name}</td>
                          <td>-</td><td>-</td>
                        </tr>`
                      ).join('')}
                      ${files.map(file => 
                        `<tr>
                          <td><i class="fas fa-file text-secondary me-2"></i>${file.name}</td>
                          <td>${formatFileSize(file.size)}</td>
                          <td>${file.lastModified}</td>
                        </tr>`
                      ).join('')}
                    </tbody>
                  </table>`
                }
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`
}

async function generateErrorHTML(message) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>错误 - R2 文件管理后台</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container py-5">
        <div class="alert alert-danger">
            <h4>连接错误</h4>
            <p>${message}</p>
            <p>请检查您的 R2 配置。</p>
        </div>
    </div>
</body>
</html>`
}

export default app
