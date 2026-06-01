import os
import json
import requests
from datetime import datetime

# 模拟 GitHub Actions 的环境变量（你需要手动设置这些）
# 或者直接在代码中填入你的配置
GITHUB_TOKEN = ""  # 填入你的 GitHub token
CONFIG_GIST_ID = ""  # 填入你的 config gist id
GIST_OWNER = ""  # 填入你的 GitHub 用户名

def fetch_gist_content(gist_id, owner, file_name=None):
    url = f"https://api.github.com/gists/{gist_id}"
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github+json'
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    gist = response.json()
    
    if file_name:
        if file_name in gist['files']:
            return json.loads(gist['files'][file_name]['content'])
        else:
            raw_url = f"https://gist.githubusercontent.com/{owner}/{gist_id}/raw/{file_name}"
            raw_response = requests.get(raw_url)
            raw_response.raise_for_status()
            return json.loads(raw_response.text)
    else:
        files = list(gist['files'].keys())
        if files:
            return json.loads(gist['files'][files[0]]['content'])
        return {}

def map_fields(data, field_map):
    result = {}
    for key, source_key in field_map.items():
        keys = source_key.split('.')
        value = data
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                value = None
                break
        result[key] = value
    return result

def test_local():
    print("=" * 50)
    print("本地测试：模拟微信模板消息发送")
    print("=" * 50)
    
    # 使用测试数据，不依赖 gist
    source_data = {
        "periodDays": 6,
        "cycleLength": 28,
        "lastPeriodStart": "2026-05-27",
        "nextPeriodPredicted": "2026-06-24"
    }
    
    field_map = {
        "nextPeriodPredicted": "nextPeriodPredicted",
        "lastPeriodStart": "lastPeriodStart",
        "cycleLength": "cycleLength"
    }
    
    mapped_data = map_fields(source_data, field_map)
    print(f"\n[Debug] 映射后的数据: {mapped_data}")
    
    # 构建微信模板消息格式
    message = {}
    today = datetime.now()
    
    if mapped_data.get('nextPeriodPredicted'):
        try:
            next_date = datetime.strptime(mapped_data['nextPeriodPredicted'], '%Y-%m-%d')
            days_left = (next_date - today).days
            message['daysLeft'] = str(days_left)
            message['nextDate'] = next_date.strftime('%Y年%m月%d日')
            message['first'] = f"距离例假还有 {days_left} 天！"
            print(f"\n[Debug] 构建的消息: {message}")
        except Exception as e:
            print(f"\n[Debug] 日期解析失败: {e}")
            message['first'] = '💡'
            message['nextDate'] = '-'
            message['daysLeft'] = '-'
    else:
        message['first'] = '💡'
        message['nextDate'] = '-'
        message['daysLeft'] = '-'
    
    # 测试微信发送
    app_id = "wx1e654ebd8417fcda"
    app_secret = "982f563f25ba1746d6dafaf0ccb85aaa"
    template_id = "y-qDbhELx8sKk0Cc_3e1YDwwp-0WgyNdnkpmJVbUh-w"
    open_id = "o9w_226Sq2gEmWLzDJGNQsHqgXg8"
    
    token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={app_id}&secret={app_secret}"
    token_response = requests.get(token_url)
    token_data = token_response.json()
    
    if 'access_token' not in token_data:
        print(f"\n获取 AccessToken 失败: {token_data}")
        return
    
    access_token = token_data['access_token']
    print(f"\n获取 AccessToken 成功")
    
    # 构建 payload
    data_payload = {
        'first': {'value': message['first'], 'color': '#173177'},
        'nextDate': {'value': message['nextDate'], 'color': '#173177'},
        'daysLeft': {'value': message['daysLeft'], 'color': '#173177'}
    }
    
    print(f"\n[Debug] 发送的 data: {data_payload}")
    
    send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
    payload = {
        'touser': open_id,
        'template_id': template_id,
        'data': data_payload
    }
    
    response = requests.post(send_url, json=payload)
    result = response.json()
    
    if result.get('errcode') == 0:
        print("\n✅ 模板消息发送成功！")
    else:
        print(f"\n❌ 发送失败: {result}")
    
    print("\n" + "=" * 50)
    print("测试完成！")
    print("=" * 50)

if __name__ == '__main__':
    test_local()
