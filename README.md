# ZxyAlert

全可视化自动化提醒平台，支持多类型推送渠道扩展，自动执行各类消息推送、自动化提醒任务。

## 核心架构

- **前端**: H5 页面，提供可视化配置界面
- **配置存储**: GitHub Gist
- **定时执行**: GitHub Actions

## 特性

- ✅ 所有项目无需改造即可接入
- ✅ 所有定时、配置、字段映射前端可视化修改
- ✅ 仓库代码永久固定，无需更新
- ✅ 完美适配所有存放在 Gist 的个人项目
- ✅ 推送渠道可自由扩展（企业微信、钉钉、Webhook）

## 快速开始

### 1. 配置 GitHub Secrets

在仓库设置中添加以下 Secrets：

- `GITHUB_TOKEN`: GitHub 个人访问令牌
- `CONFIG_GIST_ID`: 存储配置的 Gist ID
- `GIST_OWNER`: GitHub 用户名

### 2. 配置结构

Gist 配置文件格式：

```json
{
  "channels": [
    {
      "id": "channel-id",
      "name": "企业微信",
      "type": "wecom",
      "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
      "enable": true
    }
  ],
  "tasks": [
    {
      "id": "task-id",
      "taskName": "zxycycle提醒",
      "enable": true,
      "cron": "0 8 * * *",
      "remindDays": 3,
      "channelId": "channel-id",
      "message": "提醒：距离下次经期还有 {{daysLeft}} 天",
      "dataSource": {
        "gistId": "xxx",
        "fileName": "zxycycle-data.json",
        "fieldMap": {
          "lastPeriodDate": "lastPeriodDate",
          "cycleDays": "cycleDays"
        }
      }
    }
  ]
}
```

### 3. 字段映射

支持自定义字段映射，在任务配置中设置 `fieldMap`：

- `lastPeriodDate`: 上次经期日期
- `cycleDays`: 周期天数

### 4. 消息模板

支持变量替换：

- `{{daysLeft}}`: 剩余天数
- `{{nextDate}}`: 下次日期
- `{{lastDate}}`: 上次日期
- `{{任意映射字段}}`: 自定义字段

## 推送渠道

- **企业微信机器人**: `type: "wecom"`
- **钉钉机器人**: `type: "dingding"`
- **通用 Webhook**: `type: "webhook"`

## 部署

可以部署到：
- GitHub Pages
- Vercel
- Cloudflare Pages

## 项目结构

```
ZxyAlert/
├── css/
│   ├── style.css
│   └── index.css
├── js/
│   └── index.js
├── .github/
│   └── workflows/
│       └── run.yml
├── scripts/
│   └── run_alert.py
└── index.html
```