# Cloudflare 部署指南

本项目支持多种 Cloudflare 部署方式，包括 Cloudflare Workers 和 Cloudflare Pages。

## 🚀 方式一：Cloudflare Workers 部署

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
# 或者
npm install wrangler --save-dev
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 配置环境变量

在 Cloudflare Dashboard 中设置以下环境变量：

```
R2_ACCESS_KEY_ID=your_access_key_id
R2_ACCESS_KEY_SECRET=your_access_key_secret
R2_ENDPOINT=your_r2_endpoint
R2_BUCKET_NAME=mannix
DRAFT_DOMAIN=https://oss.mannix.fun
```

### 4. 创建 R2 存储桶绑定

```bash
# 创建 R2 存储桶
wrangler r2 bucket create mannix

# 或者使用现有存储桶
# 确保在 wrangler.toml 中正确配置了存储桶绑定
```

### 5. 安装依赖

```bash
npm install hono
```

### 6. 部署

```bash
# 开发环境部署
npm run deploy:dev

# 生产环境部署
npm run deploy:prod

# 或者直接部署
npm run deploy
```

### 7. 本地开发

```bash
npm run wrangler:dev
```

## 📄 方式二：Cloudflare Pages 部署

### 1. 准备静态文件

创建静态文件构建脚本，将 EJS 模板预编译为静态 HTML：

```bash
# 创建构建脚本
mkdir build
```

### 2. 配置 Pages

1. 在 Cloudflare Dashboard 中创建新的 Pages 项目
2. 连接到您的 GitHub 仓库
3. 设置构建配置：
   - 构建命令: `npm run build`
   - 输出目录: `dist`
   - Node.js 版本: `18`

### 3. 配置环境变量

在 Pages 设置中添加：

```
R2_BUCKET_NAME=mannix
DRAFT_DOMAIN=https://oss.mannix.fun
```

### 4. 设置 R2 绑定

在 Pages 设置的 Functions 标签中，添加 R2 绑定：
- 变量名: `R2_BUCKET`
- 存储桶名: `mannix`

## ⚙️ 配置文件说明

### wrangler.toml
- Workers 的主要配置文件
- 定义环境变量、R2 绑定、KV 命名空间等
- 支持多环境配置

### _cloudflare.toml
- Pages 的配置文件
- 定义构建命令、重定向规则等

### functions/api/[[path]].js
- Pages Functions 的 API 路由处理
- 处理所有 `/api/*` 路径的请求

## 🔧 环境变量配置

### 必需的环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `R2_BUCKET_NAME` | R2 存储桶名称 | `mannix` |
| `R2_ACCESS_KEY_ID` | R2 访问密钥 ID | `your_access_key` |
| `R2_ACCESS_KEY_SECRET` | R2 访问密钥密码 | `your_secret_key` |
| `R2_ENDPOINT` | R2 端点 URL | `https://...r2.cloudflarestorage.com` |
| `DRAFT_DOMAIN` | 访问域名 | `https://oss.mannix.fun` |

### 可选的环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 端口号（Workers 中为 8787） | `8787` |

## 📋 部署步骤总结

### Workers 部署
1. 安装 wrangler
2. 登录 Cloudflare
3. 配置 wrangler.toml
4. 设置环境变量
5. 创建 R2 绑定
6. 部署：`npm run deploy`

### Pages 部署
1. 连接 GitHub 仓库
2. 配置构建设置
3. 设置环境变量
4. 配置 R2 绑定
5. 自动部署

## 🔍 故障排除

### 常见问题

1. **R2 连接失败**
   - 检查存储桶名称是否正确
   - 验证访问密钥权限
   - 确认端点 URL 格式

2. **部署失败**
   - 检查 wrangler.toml 配置
   - 确认账户权限
   - 查看 Cloudflare Dashboard 日志

3. **函数超时**
   - Workers 有执行时间限制
   - 考虑优化大文件处理
   - 使用流式处理

### 调试命令

```bash
# 查看 Workers 日志
wrangler tail

# 本地调试
wrangler dev --local

# 检查配置
wrangler whoami
wrangler r2 bucket list
```

## 🌐 自定义域名

### Workers
1. 在 Cloudflare Dashboard 的 Workers 页面
2. 点击您的 Worker
3. 进入 "Triggers" 标签
4. 添加自定义域名

### Pages
1. 在 Pages 项目设置中
2. 进入 "Custom domains" 标签
3. 添加您的域名

## 🔒 安全注意事项

1. **环境变量安全**
   - 不要在代码中硬编码密钥
   - 使用 Cloudflare 的加密环境变量

2. **访问控制**
   - 考虑添加身份验证
   - 限制 IP 访问（如需要）

3. **CORS 配置**
   - 根据需要调整跨域设置
   - 避免过于宽松的 CORS 策略

## 📞 支持

如果遇到问题，可以：
1. 查看 Cloudflare 文档
2. 检查项目的 Issues
3. 联系技术支持
