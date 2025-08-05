# R2 文件管理后台

一个用于管理 Cloudflare R2 存储的 Web 后台管理系统。

## 功能特性

- 📁 文件夹浏览和导航
- 📤 文件上传（支持拖拽上传）
- 📁 创建文件夹
- 🗑️ 删除文件和文件夹
- 👁️ 文件预览（图片、视频、音频）
- 🔗 复制文件链接
- 📱 响应式设计

## 安装和运行

1. 安装依赖：
```bash
npm install
```

2. 配置信息：
编辑 `server.js` 中的配置信息，包括：
- `access_key_id`: R2 访问密钥 ID
- `access_key_secret`: R2 访问密钥密码
- `endpoint`: R2 存储桶端点
- `bucket_name`: 存储桶名称
- `draft_domain`: 你的域名

3. 启动服务器：
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

4. 访问 http://localhost:9002

## 使用说明

### 文件操作
- **上传文件**: 点击"上传文件"按钮或直接拖拽文件到上传区域
- **删除文件**: 点击文件行的垃圾桶图标
- **预览文件**: 点击文件行的眼睛图标（支持图片、视频、音频）
- **复制链接**: 点击文件行的复制图标

### 文件夹操作
- **进入文件夹**: 点击文件夹名称
- **创建文件夹**: 点击"新建文件夹"按钮
- **删除文件夹**: 点击文件夹行的垃圾桶图标（会删除文件夹及其所有内容）

### 导航
- 使用顶部的面包屑导航快速跳转到上级目录
- 点击"根目录"返回存储桶根目录

## 技术栈

- **后端**: Node.js + Express
- **前端**: Bootstrap 5 + EJS 模板引擎
- **存储**: AWS SDK (兼容 Cloudflare R2)
- **文件上传**: Multer

## 安全注意事项

⚠️ **重要**: 此系统包含敏感的 API 密钥信息，请确保：

1. 不要将包含真实密钥的代码推送到公共仓库
2. 在生产环境中使用环境变量存储敏感信息
3. 设置适当的访问控制和防火墙规则
4. 定期轮换 API 密钥

## 环境变量配置（推荐）

为了安全起见，建议使用环境变量：

```bash
# .env 文件
R2_ACCESS_KEY_ID=your_access_key_id
R2_ACCESS_KEY_SECRET=your_access_key_secret
R2_ENDPOINT=your_r2_endpoint
R2_BUCKET_NAME=your_bucket_name
DRAFT_DOMAIN=your_domain
PORT=9002
```

然后在代码中使用 `process.env.VARIABLE_NAME` 读取配置。

## 许可证

MIT License
