// Cloudflare Pages Functions - API 路由
export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const path = url.pathname

  // 跨域处理
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // R2 配置
    const bucket = env.R2_BUCKET
    if (!bucket) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'R2 bucket not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 路由处理
    if (path === '/api/test-connection') {
      return handleTestConnection(bucket, corsHeaders)
    } else if (path === '/api/bucket-info') {
      return handleBucketInfo(bucket, corsHeaders)
    } else if (path.startsWith('/api/list')) {
      return handleList(request, bucket, corsHeaders)
    } else if (path.startsWith('/api/upload')) {
      return handleUpload(request, bucket, corsHeaders)
    } else if (path.startsWith('/api/delete/')) {
      return handleDelete(request, bucket, corsHeaders)
    } else if (path === '/api/create-folder') {
      return handleCreateFolder(request, bucket, corsHeaders)
    }

    return new Response(JSON.stringify({ 
      success: false, 
      message: 'API route not found' 
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('API Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 测试连接
async function handleTestConnection(bucket, corsHeaders) {
  try {
    const objects = await bucket.list({ limit: 1 })
    return new Response(JSON.stringify({
      success: true,
      message: 'Connection successful',
      objectCount: objects.objects?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.name,
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 获取存储桶信息
async function handleBucketInfo(bucket, corsHeaders) {
  try {
    const objects = await bucket.list()
    const totalSize = objects.objects?.reduce((sum, obj) => sum + obj.size, 0) || 0
    
    return new Response(JSON.stringify({
      success: true,
      totalObjects: objects.objects?.length || 0,
      totalSize: formatFileSize(totalSize)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 列出文件
async function handleList(request, bucket, corsHeaders) {
  try {
    const url = new URL(request.url)
    const prefix = url.searchParams.get('prefix') || ''
    
    const objects = await bucket.list({ prefix, delimiter: '/' })
    
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
      type: 'file'
    })) || []

    return new Response(JSON.stringify({
      success: true,
      folders,
      files
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 上传文件
async function handleUpload(request, bucket, corsHeaders) {
  try {
    const formData = await request.formData()
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

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully uploaded ${files.length} file(s)`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Upload failed: ' + error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 删除文件
async function handleDelete(request, bucket, corsHeaders) {
  try {
    const url = new URL(request.url)
    const key = decodeURIComponent(url.pathname.replace('/api/delete/', ''))

    await bucket.delete(key)
    
    return new Response(JSON.stringify({
      success: true,
      message: 'File deleted successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Delete failed: ' + error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 创建文件夹
async function handleCreateFolder(request, bucket, corsHeaders) {
  try {
    const { folderName, prefix } = await request.json()
    
    if (!folderName || folderName.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        message: 'Folder name is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const folderKey = (prefix || '') + folderName.trim() + '/'
    await bucket.put(folderKey, '', {
      httpMetadata: {
        contentType: 'application/x-directory'
      }
    })

    return new Response(JSON.stringify({
      success: true,
      message: 'Folder created successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Create folder failed: ' + error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 工具函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
