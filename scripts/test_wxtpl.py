import requests

app_id = "wx1e654ebd8417fcda"
app_secret = "982f563f25ba1746d6dafaf0ccb85aaa"
template_id = "y-qDbhELx8sKk0Cc_3e1YDwwp-0WgyNdnkpmJVbUh-w"
open_id = "o9w_226Sq2gEmWLzDJGNQsHqgXg8"

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
            'first': {'value': '这是一条来自 ZxyAlert 的测试消息 🔔', 'color': '#173177'}
        }
    }

    response = requests.post(send_url, json=payload)
    result = response.json()

    if result.get('errcode') == 0:
        print("✅ 模板消息发送成功！")
    else:
        print(f"❌ 发送失败: {result}")
