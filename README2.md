# ZxyAlert

全可视化自动化提醒平台，支持多类型推送渠道扩展，自动执行各类消息推送、自动化提醒任务。

## 🏗️ 技术架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      ZxyAlert 系统架构                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐      HTTP API       ┌───────────────────┐    │
│   │   前端页面    │ ──────────────────► │   GitHub Gist     │    │
│   │  (H5/SPA)    │ ◄───────────────── │   (配置存储)       │    │
│   └──────┬───────┘                     └─────────┬─────────┘    │
│          │                                       │               │
│          │ 触发 Workflow                          │              │
│          ▼                                       ▼               │
│   ┌──────────────┐                     ┌───────────────────┐    │
│   │ GitHub       │ ─────定时触发────► │   Python 脚本      │    │
│   │ Actions      │                     │   run_alert.py    │    │
│   │ (Cron 调度)  │                     └─────────┬─────────┘    │
│   └──────────────┘                               │               │
│                                                  │               │
│                                                  ▼               │
│                                  ┌─────────────────────────┐    │
│                                  │      推送渠道层         │    │
│                                  │  ┌──────┬──────┬──────┐ │    │
│                                  │  │企业微信│ 钉钉 │微信 │ │    │
│                                  │  │ 机器人 │机器人│公众号│ │    │
│                                  │  └──────┴──────┴──────┘ │    │
│                                  └─────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 核心技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| **前端框架** | 原生 HTML5 + CSS3 + JavaScript ES6+ | 无需框架依赖，轻量级单页应用 |
| **样式方案** | CSS3 + Flexbox + CSS Grid | 响应式布局，现代化视觉效果 |
| **配置存储** | GitHub Gist API | 私密配置存储，支持版本控制 |
| **定时调度** | GitHub Actions + Cron | 免费云原生定时任务 |
| **后端脚本** | Python 3.10 + Requests | 轻量级执行引擎 |
| **部署方案** | GitHub Pages / Vercel / Cloudflare | 静态站点托管 |

## ⚙️ 核心原理

### 1. 配置管理原理

**数据流向：**
```
用户配置 → localStorage(临时缓存) → GitHub Gist(持久存储)
```

**关键机制：**
- 配置文件采用 JSON 格式存储在 GitHub Gist
- 前端通过 Gist API 自动查找配置文件（文件名固定为 `zxyalert-config.json`）
- 配置包含两部分：推送渠道(`channels`) 和自动化任务(`tasks`)

**配置结构：**
```json
{
  "channels": [...],
  "tasks": [...]
}
```

### 2. 定时自动化原理

**触发机制：**

```
GitHub Actions Cron
       │
       ▼ (每分钟检查)
┌─────────────────┐
│ is_cron_match() │
│  Cron 表达式匹配 │
└────────┬────────┘
         │ 匹配成功
         ▼
┌─────────────────┐
│ should_remind() │
│  提醒条件判断    │
└────────┬────────┘
         │ 满足条件
         ▼
┌─────────────────┐
│ send_message()  │
│   发送消息       │
└─────────────────┘
```

**Cron 表达式解析** ([run_alert.py](file:///c:/_Projects/GitHubProjects/ZxyAlert/scripts/run_alert.py#L35))：
- 标准 5 字段格式：`分 时 日 月 周`
- 支持通配符 `*`、范围 `-`、列表 `,`
- 每分钟检查一次，匹配则执行任务

**提醒条件判断** ([run_alert.py](file:///c:/_Projects/GitHubProjects/ZxyAlert/scripts/run_alert.py#L176))：
```python
def should_remind(data, remind_days):
    # 判断目标日期是否在提醒范围内
    next_date = datetime.strptime(data['nextPeriodPredicted'], '%Y-%m-%d')
    days_left = (next_date - datetime.now()).days
    return 0 <= days_left <= remind_days
```

### 3. 字段映射原理

**数据源 → 消息模板 的动态映射：**

```
原始数据 (Gist)              字段映射 (fieldMap)               消息模板
─────────────────           ──────────────────               ──────────
{                           {                               "距离{{targetDate}}还有
  "nextPeriodPredicted":     "targetDate": "{{daysLeft}}天"
  "2024-08-15"              "nextPeriodPredicted"
}                           }                               剩余{{daysLeft}}天"
       │                           │                              │
       │───字段映射───►             │                              │
       │                           ▼                              │
       │                    映射后数据                            │
       │                    {                                    │
       │                      "targetDate": "2024-08-15"         │
       │                      "daysLeft": 7                      │
       │                    }                                    │
       │                           │                              │
       └───────────────────────────┴───变量替换───►              ▼
                                                        "距离2024-08-15还有7天"
```

### 4. 推送渠道扩展原理

**统一消息发送接口** ([run_alert.py](file:///c:/_Projects/GitHubProjects/ZxyAlert/scripts/run_alert.py#L99))：

| 渠道类型 | 实现方式 | 消息格式 |
|---------|---------|---------|
| **企业微信** | Webhook POST | `{"msgtype": "text", "text": {"content": ...}}` |
| **钉钉** | Webhook POST | `{"msgtype": "text", "text": {"content": ...}}` |
| **微信公众号** | 模板消息 API | 需要 AccessToken，结构化数据 |
| **通用 Webhook** | 自定义 POST | `{"message": ...}` |

**微信公众号特殊处理**：
1. 通过 AppID + AppSecret 获取 AccessToken
2. 构建模板消息结构化数据
3. 调用微信模板消息发送 API

## 📁 项目结构

```
ZxyAlert/
├── .github/
│   └── workflows/
│       └── run.yml          # GitHub Actions 定时任务配置
├── css/
│   ├── style.css            # 全局样式
│   └── index.css            # 页面特定样式
├── js/
│   └── index.js             # 前端核心逻辑
├── img/
│   └── avatar1.jpg          # 默认头像
├── scripts/
│   └── run_alert.py         # 自动化执行脚本
├── index.html               # 主页面
└── README.md                # 项目文档
```

### 文件职责说明

| 文件 | 职责 | 关键功能 |
|------|------|---------|
| `index.html` | 页面结构 | 导航、表单、弹窗、布局 |
| `js/index.js` | 前端逻辑 | 配置管理、任务CRUD、API交互 |
| `css/style.css` | 基础样式 | 全局样式、组件样式、响应式 |
| `css/index.css` | 页面样式 | 特定页面组件样式 |
| `scripts/run_alert.py` | 执行引擎 | Cron解析、消息发送、数据处理 |
| `.github/workflows/run.yml` | 调度配置 | 定时触发、环境变量、依赖安装 |

## 🚀 快速开始

### 1. 创建 GitHub Personal Access Token

需要以下权限：
- `gist` - 用于读写配置文件
- `repo` - 用于触发 GitHub Actions（可选）

### 2. 配置 GitHub Secrets

在仓库 Settings > Secrets and variables > Actions 中添加：

| Secret | 说明 | 获取方式 |
|--------|------|---------|
| `MY_TOKEN` | GitHub 个人访问令牌 | GitHub Settings 创建 |
| `MY_CONFIG_GIST_ID` | 配置 Gist ID | 创建空白 Gist 后获取 |
| `MY_GIST_OWNER` | GitHub 用户名 | 你的 GitHub 账号名 |

### 3. 配置推送渠道

登录前端页面，配置推送渠道：

**企业微信机器人：**
```
渠道类型: 企业微信机器人
Webhook地址: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
```

**微信公众号（模板消息）：**
```
渠道类型: 微信公众平台（模板消息）
AppID: xxx
AppSecret: xxx
模板消息ID: xxx
用户OpenID: xxx
```

### 4. 创建自动化任务

**任务配置说明：**

| 字段 | 说明 | 示例 |
|------|------|------|
| 任务名称 | 任务标识 | "经期提醒" |
| Cron 表达式 | 执行时间 | "0 8 * * *"（每天早上8点） |
| 提醒天数 | 提前多少天提醒 | 3 |
| 推送渠道 | 选择已配置的渠道 | 企业微信 |
| Gist ID | 数据源 Gist | xxx |
| 文件名 | 数据源文件 | zxycycle-data.json |
| 字段映射 | 数据源字段映射 | {"targetDate": "nextPeriodPredicted"} |
| 提醒文案 | 消息模板 | "距离{{targetDate}}还有{{daysLeft}}天" |

## 🔧 高级配置

### Cron 表达式示例

| 表达式 | 含义 |
|--------|------|
| `0 8 * * *` | 每天早上8点 |
| `0 8,20 * * *` | 每天早上8点和晚上8点 |
| `0 8 * * 1` | 每周一早上8点 |
| `0 8 1 * *` | 每月1号早上8点 |
| `*/30 * * * *` | 每30分钟 |

### 消息模板变量

支持的内置变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{daysLeft}}` | 剩余天数 | 7 |
| `{{nextDate}}` | 目标日期 | 2024年08月15日 |
| `{{lastDate}}` | 上次日期 | 2024年07月20日 |
| `{{任意映射字段}}` | 自定义字段 | 根据 fieldMap 配置 |

### 测试模式

可以通过手动触发 GitHub Actions 并设置 `test_mode: true` 来测试微信公众号推送。

### 配置导入导出

在全局配置页面的"配置预览"卡片右上角提供了导入导出功能：

| 功能 | 说明 |
|------|------|
| � **导入配置** | 从本地 JSON 文件导入配置，会覆盖当前配置 |
| 📤 **导出配置** | 将当前配置导出为 JSON 文件，文件名格式为 `zxyalert-config-YYYY-MM-DD.json` |

**导入配置格式要求**：
- 文件必须是有效的 JSON 格式
- 配置会经过安全验证，自动清理潜在的恶意内容
- 导入前会弹出确认对话框，防止误操作

## � 安全说明

### XSS 防护

系统内置了多层 XSS（跨站脚本攻击）防护机制：

1. **输入转义**：所有用户输入在保存前都会经过 HTML 特殊字符转义
2. **输出转义**：所有数据在渲染到页面时都会再次转义
3. **配置验证**：导入的配置会经过严格的结构验证和清理
4. **字段长度限制**：所有字段都有最大长度限制，防止超限攻击
5. **类型验证**：渠道类型等字段会验证为合法值

### 数据安全

- **Token 安全**：Token 仅存储在浏览器 localStorage，清除时会一并删除
- **配置安全**：配置存储在私密 Gist，仅 Token 持有者可访问
- **传输安全**：所有 API 调用均通过 HTTPS
- **密码保护**：敏感配置（如 AppSecret）在前端输入时使用 `type="password"`

## 📝 部署方式

### GitHub Pages（推荐）

1. 仓库设置 > Pages > Source
2. 选择 `main` 分支，`/root` 目录
3. 点击 Save，等待部署完成

### Vercel

1. 导入 GitHub 仓库
2. 配置构建命令（无需构建，直接部署静态文件）
3. 部署完成

### Cloudflare Pages

1. 连接 GitHub 仓库
2. 配置构建设置（无需构建命令）
3. 部署完成

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**数据存储说明**：🔐 数据存储于 GitHub Gist，Token 临时保存在本地