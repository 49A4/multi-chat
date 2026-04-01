# Multi-Model Streaming Demo

## IDEA 直接启动（已预置后端配置）

项目里已添加共享运行配置文件：
- `.run/Backend-SpringBoot-Maven.run.xml`

在 IDEA 操作：
1. 打开项目根目录 `D:\file\javaproject\ai`
2. 右上角 Run Configuration 下拉框选择 `Backend SpringBoot (Maven)`
3. 点击运行

如果下拉框没看到这个配置：
1. `File -> Reload All from Disk`
2. 或重启 IDEA 重新打开项目

后端地址：`http://localhost:8080`

## 前端启动

在 IDEA Terminal 执行：

```powershell
cd D:\file\javaproject\ai\frontend
npm install --cache .npm-cache
npm run dev
```

前端地址：`http://localhost:5173`

## 脚本一键启动

- 双击：`D:\file\javaproject\ai\start-demo.bat`
- 或执行：

```powershell
./start-demo.ps1
```

## Demo 接口

- `POST /api/sessions`
- `POST /api/demo/stream`
- `GET /health`

## API 配置持久化

- API 配置会自动保存到本地文件：`%USERPROFILE%\.multi-chat\api-configs.json`
- 后端启动时会自动从该文件加载，所以重启后配置不会丢失
