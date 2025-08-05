require('dotenv').config();
const express = require('express');
const { 
    S3Client, 
    ListObjectsV2Command,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const path = require('path');
const moment = require('moment');
const cors = require('cors');
const archiver = require('archiver');

const app = express();

// 配置信息 - 优先使用环境变量
const config = {
    "draft_domain": process.env.DRAFT_DOMAIN,
    "port": parseInt(process.env.PORT) || 9002,
    "preview_router": "",
    "oss_config": {
        "bucket_name": process.env.R2_BUCKET_NAME,
        "access_key_id": process.env.R2_ACCESS_KEY_ID,
        "access_key_secret": process.env.R2_ACCESS_KEY_SECRET,
        "endpoint": process.env.R2_ENDPOINT,
    }
};

// 配置 AWS SDK for Cloudflare R2
const s3 = new S3Client({
    region: 'auto',
    endpoint: config.oss_config.endpoint,
    credentials: {
        accessKeyId: config.oss_config.access_key_id,
        secretAccessKey: config.oss_config.access_key_secret,
    },
});


// 中间件
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 配置 multer 用于文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB 限制
    }
});

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 首页 - 显示文件列表
app.get('/', async (req, res) => {
    try {
        const prefix = req.query.prefix || '';
        console.log(`Listing objects with prefix: "${prefix}"`);
        console.log(`Bucket: ${config.oss_config.bucket_name}`);
        console.log(`Endpoint: ${config.oss_config.endpoint}`);
        
        const command = new ListObjectsV2Command({
            Bucket: config.oss_config.bucket_name,
            Prefix: prefix,
            Delimiter: '/'
        });

        const data = await s3.send(command);
        console.log(`Found ${data.Contents?.length || 0} files and ${data.CommonPrefixes?.length || 0} folders`);
        
        // 处理文件夹和文件
        const folders = data.CommonPrefixes ? data.CommonPrefixes.map(item => ({
            name: item.Prefix.replace(prefix, '').replace('/', ''),
            prefix: item.Prefix,
            type: 'folder'
        })) : [];

        const files = data.Contents ? data.Contents
            .filter(item => item.Key !== prefix && !item.Key.endsWith('/')) // 排除当前文件夹本身和空文件夹
            .map(item => ({
                name: item.Key.replace(prefix, ''),
                key: item.Key,
                size: item.Size,
                lastModified: moment(item.LastModified).format('YYYY-MM-DD HH:mm:ss'),
                url: `${config.draft_domain}/${item.Key}`,
                type: 'file'
            })) : [];

        const breadcrumbs = prefix ? prefix.split('/').filter(Boolean).map((part, index, array) => ({
            name: part,
            prefix: array.slice(0, index + 1).join('/') + '/'
        })) : [];

        res.render('index', {
            folders,
            files,
            currentPrefix: prefix,
            breadcrumbs,
            domain: config.draft_domain,
            formatFileSize
        });
    } catch (error) {
        console.error('Error listing objects:', error);
        
        // 检查是否是访问权限或配置问题
        if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
            console.error('This might be a configuration issue. Please check:');
            console.error('1. Bucket name is correct');
            console.error('2. Access keys have proper permissions');
            console.error('3. Endpoint URL is correct');
            console.error('4. The bucket exists and is accessible');
        }
        
        // 渲染一个错误页面而不是直接返回错误
        res.render('index', {
            folders: [],
            files: [],
            currentPrefix: '',
            breadcrumbs: [],
            domain: config.draft_domain,
            formatFileSize,
            error: {
                message: error.message,
                code: error.Code || error.name,
                details: 'Please check your R2 configuration. The bucket might be empty, inaccessible, or incorrectly configured.'
            }
        });
    }
});

// 上传文件
app.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        const prefix = req.body.prefix || '';
        const uploadPromises = req.files.map(async file => {
            const key = prefix + file.originalname;
            const command = new PutObjectCommand({
                Bucket: config.oss_config.bucket_name,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype
            });
            return await s3.send(command);
        });

        const results = await Promise.all(uploadPromises);
        console.log('Upload successful:', req.files.map(f => prefix + f.originalname));
        res.json({ success: true, message: `Successfully uploaded ${req.files.length} file(s)` });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
    }
});

// 删除文件
app.delete('/delete/:key(*)', async (req, res) => {
    try {
        const key = decodeURIComponent(req.params.key);
        const command = new DeleteObjectCommand({
            Bucket: config.oss_config.bucket_name,
            Key: key
        });

        await s3.send(command);
        console.log('File deleted:', key);
        res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ success: false, message: 'Delete failed: ' + error.message });
    }
});

// 创建文件夹
app.post('/create-folder', async (req, res) => {
    try {
        const { folderName, prefix } = req.body;
        if (!folderName || folderName.trim() === '') {
            return res.status(400).json({ success: false, message: 'Folder name is required' });
        }
        
        const folderKey = (prefix || '') + folderName.trim() + '/';
        
        const command = new PutObjectCommand({
            Bucket: config.oss_config.bucket_name,
            Key: folderKey,
            Body: '',
            ContentType: 'application/x-directory'
        });

        await s3.send(command);
        console.log('Folder created:', folderKey);
        res.json({ success: true, message: 'Folder created successfully' });
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ success: false, message: 'Create folder failed: ' + error.message });
    }
});

// 删除文件夹（及其所有内容）
app.delete('/delete-folder', async (req, res) => {
    try {
        const { prefix } = req.body;
        
        if (!prefix) {
            return res.status(400).json({ success: false, message: 'Prefix is required' });
        }
        
        // 列出文件夹中的所有对象
        const listCommand = new ListObjectsV2Command({
            Bucket: config.oss_config.bucket_name,
            Prefix: prefix
        });

        const data = await s3.send(listCommand);
        
        if (data.Contents && data.Contents.length > 0) {
            // 删除所有对象
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: config.oss_config.bucket_name,
                Delete: {
                    Objects: data.Contents.map(item => ({ Key: item.Key }))
                }
            });

            await s3.send(deleteCommand);
            console.log('Folder deleted:', prefix, `(${data.Contents.length} objects)`);
        }

        res.json({ success: true, message: 'Folder deleted successfully' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ success: false, message: 'Delete folder failed: ' + error.message });
    }
});

// 获取文件预览 URL
app.get('/preview/:key(*)', async (req, res) => {
    try {
        const key = decodeURIComponent(req.params.key);
        const command = new GetObjectCommand({
            Bucket: config.oss_config.bucket_name,
            Key: key
        });

        const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1小时有效期
        res.json({ success: true, url });
    } catch (error) {
        console.error('Error generating preview URL:', error);
        res.status(500).json({ success: false, message: 'Preview failed: ' + error.message });
    }
});

// 下载文件夹为 ZIP
app.get('/download-folder/:prefix(*)', async (req, res) => {
    try {
        const prefix = decodeURIComponent(req.params.prefix);
        const folderName = prefix.split('/').filter(Boolean).pop() || 'root';
        
        console.log(`Downloading folder: ${prefix}`);
        
        // 列出文件夹中的所有文件
        const listCommand = new ListObjectsV2Command({
            Bucket: config.oss_config.bucket_name,
            Prefix: prefix
        });

        const data = await s3.send(listCommand);
        
        if (!data.Contents || data.Contents.length === 0) {
            return res.status(404).json({ success: false, message: 'Folder is empty or does not exist' });
        }

        // 设置响应头
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        // 创建 ZIP 压缩器
        const archive = archiver('zip', {
            zlib: { level: 9 } // 压缩级别
        });

        // 错误处理
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Archive creation failed' });
            }
        });

        // 将压缩流连接到响应
        archive.pipe(res);

        // 下载并添加每个文件到压缩包
        const downloadPromises = data.Contents.map(async (item) => {
            // 跳过文件夹标记（以 / 结尾的空文件）
            if (item.Key.endsWith('/')) {
                return;
            }

            try {
                const getCommand = new GetObjectCommand({
                    Bucket: config.oss_config.bucket_name,
                    Key: item.Key
                });

                const response = await s3.send(getCommand);
                
                // 计算相对路径（去掉前缀）
                const relativePath = item.Key.replace(prefix, '');
                
                // 将文件添加到压缩包
                archive.append(response.Body, { name: relativePath });
                
                console.log(`Added to archive: ${relativePath}`);
            } catch (error) {
                console.error(`Error downloading file ${item.Key}:`, error);
            }
        });

        // 等待所有文件下载完成
        await Promise.all(downloadPromises);

        // 完成压缩
        archive.finalize();
        
        console.log(`Folder download completed: ${folderName}.zip`);
    } catch (error) {
        console.error('Error downloading folder:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Download failed: ' + error.message });
        }
    }
});

// 获取存储桶信息
app.get('/api/bucket-info', async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: config.oss_config.bucket_name
        });
        
        // 获取存储桶中的对象数量和总大小
        const data = await s3.send(command);
        const totalObjects = data.KeyCount || 0;
        const totalSize = data.Contents ? data.Contents.reduce((sum, obj) => sum + obj.Size, 0) : 0;
        
        res.json({
            success: true,
            bucketName: config.oss_config.bucket_name,
            totalObjects,
            totalSize: formatFileSize(totalSize),
            domain: config.draft_domain
        });
    } catch (error) {
        console.error('Error getting bucket info:', error);
        res.status(500).json({ success: false, message: 'Failed to get bucket info: ' + error.message });
    }
});

// 测试连接
app.get('/api/test-connection', async (req, res) => {
    try {
        console.log('Testing R2 connection...');
        console.log('Bucket:', config.oss_config.bucket_name);
        console.log('Endpoint:', config.oss_config.endpoint);
        console.log('Access Key ID:', config.oss_config.access_key_id.substring(0, 8) + '...');
        
        const command = new ListObjectsV2Command({
            Bucket: config.oss_config.bucket_name,
            MaxKeys: 1
        });
        
        const data = await s3.send(command);
        console.log('Connection successful!');
        
        res.json({
            success: true,
            message: 'Connection successful',
            bucketName: config.oss_config.bucket_name,
            objectCount: data.KeyCount || 0,
            endpoint: config.oss_config.endpoint
        });
    } catch (error) {
        console.error('Connection test failed:', error);
        res.json({
            success: false,
            error: error.name || error.Code,
            message: error.message,
            details: {
                bucketName: config.oss_config.bucket_name,
                endpoint: config.oss_config.endpoint,
                statusCode: error.$metadata?.httpStatusCode
            }
        });
    }
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// 404 处理
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// 启动服务器
const PORT = config.port;
app.listen(PORT, () => {
    console.log('🚀 R2 Dashboard Server Started');
    console.log(`📍 Server running on: http://localhost:${PORT}`);
    console.log(`📦 Managing bucket: ${config.oss_config.bucket_name}`);
    console.log(`🌐 Domain: ${config.draft_domain}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('─────────────────────────────────────');
});
