#!/bin/bash

# 构建脚本 - 为 Cloudflare Pages 准备静态文件

echo "🚀 开始构建 R2 Dashboard for Cloudflare..."

# 创建输出目录
mkdir -p dist

# 复制静态文件
echo "📄 复制静态文件..."
cp -r views dist/ 2>/dev/null || echo "No views directory found"
cp -r public dist/ 2>/dev/null || echo "No public directory found"

# 创建基本的 index.html (如果没有其他静态文件)
if [ ! -f "dist/index.html" ]; then
    echo "📝 创建基本 HTML 文件..."
    cat > dist/index.html << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>R2 文件管理后台</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body>
    <div class="container py-5">
        <div class="text-center">
            <h1><i class="fas fa-cloud me-3"></i>R2 文件管理后台</h1>
            <p class="lead">正在加载文件管理界面...</p>
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    </div>
    
    <script>
        // 重定向到 API 或显示管理界面
        fetch('/api/test-connection')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 可以在这里加载完整的管理界面
                    window.location.href = '/dashboard';
                } else {
                    document.body.innerHTML = `
                        <div class="container py-5">
                            <div class="alert alert-danger">
                                <h4>连接失败</h4>
                                <p>无法连接到 R2 存储，请检查配置。</p>
                                <p>${data.message}</p>
                            </div>
                        </div>
                    `;
                }
            })
            .catch(error => {
                document.body.innerHTML = `
                    <div class="container py-5">
                        <div class="alert alert-warning">
                            <h4>加载中...</h4>
                            <p>正在初始化文件管理系统...</p>
                        </div>
                    </div>
                `;
            });
    </script>
</body>
</html>
EOF
fi

echo "✅ 构建完成！"
echo "📁 输出目录: dist/"
echo "🌐 准备部署到 Cloudflare Pages"
