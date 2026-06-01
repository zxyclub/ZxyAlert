import requests
from datetime import datetime

app_id = "wx1e654ebd8417fcda"
app_secret = "982f563f25ba1746d6dafaf0ccb85aaa"
template_id = "y-qDbhELx8sKk0Cc_3e1YDwwp-0WgyNdnkpmJVbUh-w"
open_id = "o9w_226Sq2gEmWLzDJGNQsHqgXg8"

# 你的 zxycycle 数据
data = {
  "periodDays": 6,
  "cycleLength": 28,
  "lastPeriodStart": "2026-05-27",
  "periodHistory": [
    {
      "startDate": "2025-12-21",
      "periodDays": 6,
      "isEnded": True
    },
    {
      "startDate": "2026-01-18",
      "periodDays": 6,
      "isEnded": True
    },
    {
      "startDate": "2026-02-13",
      "periodDays": 7,
      "isEnded": True
    },
    {
      "startDate": "2026-03-10",
      "periodDays": 6,
      "isEnded": True
    },
    {
      "startDate": "2026-04-04",
      "periodDays": 6,
      "isEnded": True
    },
    {
      "startDate": "2026-04-30",
      "periodDays": 6,
      "isEnded": True
    },
    {
      "startDate": "2026-05-27",
      "periodDays": 6,
      "isEnded": False
    }
  ],
  "nextPeriodPredicted": "2026-06-24",
  "loveRecords": []
}

# 模拟 render_message
today = datetime.now()
message = "💡 距离例假还有 {{daysLeft}} 天！\n📅 预计日期：{{nextDate}}"

if data.get('nextPeriodPredicted'):
    try:
        next_date = datetime.strptime(data['nextPeriodPredicted'], '%Y-%m-%d')
        days_left = (next_date - today).days
        data['daysLeft'] = days_left
        data['nextDate'] = next_date.strftime('%Y年%m月%d日')
        print(f"[Debug] nextPeriodPredicted: {data['nextPeriodPredicted']}, daysLeft: {days_left}, nextDate: {data['nextDate']}")
    except Exception as e:
        print(f"[Debug] 日期解析失败: {e}")

for key, value in data.items():
    message = message.replace(f'{{{{{key}}}}}', str(value))

print(f"[Debug] 最终消息: {message}")

# 发送消息
token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={app_id}&secret={app_secret}"
token_response = requests.get(token_url)
token_data = token_response.json()

if 'access_token' not in token_data:
    print(f"获取 AccessToken 失败: {token_data}")
else:
    access_token = token_data['access_token']
    print(f"获取 AccessToken 成功")

    send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
    payload = {
        'touser': open_id,
        'template_id': template_id,
        'data': {
            'first': {'value': message, 'color': '#173177'}
        }
    }

    response = requests.post(send_url, json=payload)
    result = response.json()

    if result.get('errcode') == 0:
        print("✅ 模板消息发送成功！")
    else:
        print(f"❌ 发送失败: {result}")
