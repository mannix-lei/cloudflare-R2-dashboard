# 🚀 快速部署到 Cloudflare

## 📋 准备工作

1. **Cloudflare 账户**
   - 确保您有 Cloudflare 账户
   - 获取 API Token（具有 Workers 和 R2 权限）

2. **R2 存储桶**
   - 确保您的 R2 存储桶 `mannix` 已创建
   - 获取访问凭据

## ⚡ 一键部署（推荐）

### 方式一：Cloudflare Workers

```bash
# 1. 安装 Wrangler
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 部署
npm run deploy
```

### 方式二：Cloudflare Pages

1. Fork 这个仓库到您的 GitHub
2. 在 Cloudflare Dashboard 中：
   - 进入 Pages
   - 点击 "Create a project"
   - 连接 GitHub 仓库
   - 选择您 fork 的仓库

3. 配置构建设置：
   ```
   构建命令: npm run build
   输出目录: dist
   ```

4. 添加环境变量（在 Pages 设置中）：
   ```
   R2_BUCKET_NAME=mannix
   DRAFT_DOMAIN=https://oss.mannix.fun
   ```

5. 设置 R2 绑定：
   - 在 Functions 标签中添加 R2 绑定
   - 变量名: `R2_BUCKET`
   - 存储桶: `mannix`

## 🔧 环境变量配置

在 Cloudflare Dashboard 中设置：

| 变量名 | 值 |
|--------|-----|
| `R2_BUCKET_NAME` | `mannix` |
| `R2_ACCESS_KEY_ID` | `your_access_key_id` |
| `R2_ACCESS_KEY_SECRET` | `your_access_key_secret` |
| `R2_ENDPOINT` | `your_r2_endpoint` |
| `DRAFT_DOMAIN` | `https://oss.mannix.fun` |

## 🔍 验证部署

部署完成后：

1. 访问您的 Workers/Pages URL
2. 检查 API 连接：`https://your-domain.com/api/test-connection`
3. 测试文件上传和管理功能

## 🆘 故障排除

### 常见问题：

1. **R2 绑定失败**
   ```bash
   wrangler r2 bucket create mannix
   ```

2. **环境变量未设置**
   - 检查 Cloudflare Dashboard 中的环境变量
   - 确保所有必需变量都已设置

3. **部署失败**
   ```bash
   wrangler whoami
   wrangler r2 bucket list
   ```

## 📞 获取帮助

- 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 获取详细说明
- 检查 Cloudflare Workers/Pages 文档
- 查看项目 Issues
