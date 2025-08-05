// Cloudflare Pages 入口文件
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

// 中间件
app.use('*', logger())
app.use('*', cors())

// R2 配置
const getR2Config = (env) => ({
  bucket_name: env.R2_BUCKET_NAME || 'mannix',
  access_key_id: env.R2_ACCESS_KEY_ID,
  access_key_secret: env.R2_ACCESS_KEY_SECRET,
  endpoint: env.R2_ENDPOINT,
  draft_domain: env.DRAFT_DOMAIN || 'https://oss.mannix.fun'
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
app.post('/api/upload', async (c) => {
  try {
    const env = c.env
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
app.delete('/api/delete/:key{.*}', async (c) => {
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
app.post('/api/create-folder', async (c) => {
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

// 删除文件夹路由
app.delete('/api/delete-folder', async (c) => {
  try {
    const env = c.env
    const bucket = env.R2_BUCKET
    const { prefix } = await c.req.json()

    if (!prefix) {
      return c.json({ 
        success: false, 
        message: 'Prefix is required' 
      }, 400)
    }

    const objects = await bucket.list({ prefix })
    
    if (objects.objects && objects.objects.length > 0) {
      // 删除所有对象
      for (const obj of objects.objects) {
        await bucket.delete(obj.key)
      }
      console.log('Folder deleted:', prefix, `(${objects.objects.length} objects)`)
    }

    return c.json({ success: true, message: 'Folder deleted successfully' })
  } catch (error) {
    console.error('Error deleting folder:', error)
    return c.json({ 
      success: false, 
      message: 'Delete folder failed: ' + error.message 
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
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>R2 文件管理后台 - Cloudflare Pages</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        .file-item {
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .file-item:hover {
            background-color: #f8f9fa;
        }
        .folder-icon {
            color: #ffc107;
        }
        .file-icon {
            color: #6c757d;
        }
        .breadcrumb-item a {
            text-decoration: none;
        }
        .upload-area {
            border: 2px dashed #dee2e6;
            border-radius: 0.375rem;
            padding: 2rem;
            text-align: center;
            transition: border-color 0.2s;
        }
        .upload-area:hover {
            border-color: #0d6efd;
        }
        .upload-area.dragover {
            border-color: #0d6efd;
            background-color: #f8f9fa;
        }
    </style>
</head>
<body>
    <div class="container-fluid py-4">
        <div class="row">
            <div class="col-12">
                <h1 class="mb-4">
                    <i class="fas fa-cloud me-2"></i>
                    R2 文件管理后台
                    <small class="text-muted ms-2">Cloudflare Pages</small>
                </h1>

                <!-- 面包屑导航 -->
                <nav aria-label="breadcrumb" class="mb-4">
                    <ol class="breadcrumb">
                        <li class="breadcrumb-item">
                            <a href="/" class="text-decoration-none">
                                <i class="fas fa-home"></i> 根目录
                            </a>
                        </li>
                        ${breadcrumbs.map((crumb, index) => 
                          index === breadcrumbs.length - 1 
                            ? `<li class="breadcrumb-item active">${crumb.name}</li>`
                            : `<li class="breadcrumb-item"><a href="/?prefix=${crumb.prefix}" class="text-decoration-none">${crumb.name}</a></li>`
                        ).join('')}
                    </ol>
                </nav>

                <!-- 操作按钮 -->
                <div class="row mb-4">
                    <div class="col-md-6">
                        <button class="btn btn-primary me-2" data-bs-toggle="modal" data-bs-target="#uploadModal">
                            <i class="fas fa-upload me-1"></i> 上传文件
                        </button>
                        <button class="btn btn-success me-2" data-bs-toggle="modal" data-bs-target="#createFolderModal">
                            <i class="fas fa-folder-plus me-1"></i> 新建文件夹
                        </button>
                    </div>
                    <div class="col-md-6 text-md-end">
                        <small class="text-muted">
                            域名: <a href="${domain}" target="_blank">${domain}</a>
                        </small>
                    </div>
                </div>

                <!-- 文件列表 -->
                <div class="card">
                    <div class="card-body">
                        ${folders.length === 0 && files.length === 0 ? 
                          `<div class="text-center py-5">
                                <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                                <p class="text-muted">此文件夹为空</p>
                                <p class="text-muted">
                                    <small>您可以上传文件或创建新文件夹开始使用</small>
                                </p>
                            </div>` :
                          `<div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>名称</th>
                                            <th>大小</th>
                                            <th>修改时间</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${folders.map(folder => 
                                          `<tr class="file-item" onclick="window.location.href='/?prefix=${folder.prefix}'">
                                                <td>
                                                    <i class="fas fa-folder folder-icon me-2"></i>
                                                    ${folder.name}
                                                </td>
                                                <td>-</td>
                                                <td>-</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteFolder('${folder.prefix}')" title="删除文件夹">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>`
                                        ).join('')}
                                        ${files.map(file => 
                                          `<tr class="file-item">
                                                <td>
                                                    <i class="fas fa-file file-icon me-2"></i>
                                                    ${file.name}
                                                </td>
                                                <td>${formatFileSize(file.size)}</td>
                                                <td>${new Date(file.lastModified).toLocaleString('zh-CN')}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-primary me-1" onclick="copyUrl('${file.url}')" title="复制链接">
                                                        <i class="fas fa-copy"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="deleteFile('${file.key}')" title="删除文件">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>`
                                        ).join('')}
                                    </tbody>
                                </table>
                            </div>`
                        }
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 上传文件模态框 -->
    <div class="modal fade" id="uploadModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">上传文件</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="uploadForm" enctype="multipart/form-data">
                        <input type="hidden" name="prefix" value="${currentPrefix}">
                        <div class="upload-area" id="uploadArea">
                            <i class="fas fa-cloud-upload-alt fa-3x text-muted mb-3"></i>
                            <p class="mb-2">将文件拖拽到此处或点击选择文件</p>
                            <input type="file" id="fileInput" name="files" multiple class="form-control" style="display: none;">
                            <button type="button" class="btn btn-outline-primary" onclick="document.getElementById('fileInput').click()">
                                选择文件
                            </button>
                        </div>
                        <div id="fileList" class="mt-3"></div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-primary" onclick="uploadFiles()">上传</button>
                </div>
            </div>
        </div>
    </div>

    <!-- 新建文件夹模态框 -->
    <div class="modal fade" id="createFolderModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">新建文件夹</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="createFolderForm">
                        <div class="mb-3">
                            <label for="folderName" class="form-label">文件夹名称</label>
                            <input type="text" class="form-control" id="folderName" name="folderName" required>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-success" onclick="createFolder()">创建</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap JS -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <script>
        // 格式化文件大小
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // 复制链接
        function copyUrl(url) {
            navigator.clipboard.writeText(url).then(() => {
                alert('链接已复制到剪贴板');
            });
        }

        // 删除文件
        function deleteFile(key) {
            if (confirm('确定要删除这个文件吗？')) {
                fetch(\`/api/delete/\${encodeURIComponent(key)}\`, {
                    method: 'DELETE'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('删除失败: ' + data.message);
                    }
                })
                .catch(error => {
                    alert('删除失败: ' + error.message);
                });
            }
        }

        // 删除文件夹
        function deleteFolder(prefix) {
            if (confirm('确定要删除这个文件夹及其所有内容吗？')) {
                fetch('/api/delete-folder', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ prefix })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert('删除失败: ' + data.message);
                    }
                })
                .catch(error => {
                    alert('删除失败: ' + error.message);
                });
            }
        }

        // 文件上传相关
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const fileList = document.getElementById('fileList');

        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            handleFiles(files);
        });

        // 文件选择
        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });

        function handleFiles(files) {
            fileList.innerHTML = '';
            Array.from(files).forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'alert alert-info';
                fileItem.innerHTML = \`
                    <i class="fas fa-file me-2"></i>
                    \${file.name} (\${formatFileSize(file.size)})
                \`;
                fileList.appendChild(fileItem);
            });
        }

        // 上传文件
        function uploadFiles() {
            const formData = new FormData(document.getElementById('uploadForm'));
            const files = fileInput.files;
            
            if (files.length === 0) {
                alert('请选择文件');
                return;
            }

            fetch('/api/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
                    location.reload();
                } else {
                    alert('上传失败: ' + data.message);
                }
            })
            .catch(error => {
                alert('上传失败: ' + error.message);
            });
        }

        // 创建文件夹
        function createFolder() {
            const folderName = document.getElementById('folderName').value.trim();
            if (!folderName) {
                alert('请输入文件夹名称');
                return;
            }

            fetch('/api/create-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folderName,
                    prefix: '${currentPrefix}'
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    bootstrap.Modal.getInstance(document.getElementById('createFolderModal')).hide();
                    location.reload();
                } else {
                    alert('创建失败: ' + data.message);
                }
            })
            .catch(error => {
                alert('创建失败: ' + error.message);
            });
        }

        // 重置表单
        document.getElementById('uploadModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('uploadForm').reset();
            fileList.innerHTML = '';
        });

        document.getElementById('createFolderModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('createFolderForm').reset();
        });
    </script>
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
