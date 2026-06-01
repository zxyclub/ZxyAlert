import os
import json
import requests
from datetime import datetime, timedelta

GITHUB_TOKEN = os.environ.get('MY_TOKEN')
CONFIG_GIST_ID = os.environ.get('MY_CONFIG_GIST_ID')
GIST_OWNER = os.environ.get('MY_GIST_OWNER')

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

def is_cron_match(cron):
    now = datetime.now()
    parts = cron.split()
    
    if len(parts) != 5:
        return False
    
    minute, hour, day, month, weekday = parts
    
    def matches(value, current):
        if value == '*':
            return True
        if ',' in value:
            return str(current) in value.split(',')
        if '-' in value:
            start, end = value.split('-')
            return int(start) <= current <= int(end)
        return str(current) == value
    
    return (matches(minute, now.minute) and
            matches(hour, now.hour) and
            matches(day, now.day) and
            matches(month, now.month) and
            matches(weekday, now.weekday()))

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

def render_message(template, data):
    message = template
    today = datetime.now()
    
    if data.get('nextPeriodPredicted'):
        try:
            next_date = datetime.strptime(data['nextPeriodPredicted'], '%Y-%m-%d')
            days_left = (next_date - today).days
            data['daysLeft'] = days_left
            data['nextDate'] = next_date.strftime('%Y年%m月%d日')
        except:
            pass
    
    if data.get('lastPeriodStart'):
        try:
            last_date = datetime.strptime(data['lastPeriodStart'], '%Y-%m-%d')
            data['lastDate'] = last_date.strftime('%Y年%m月%d日')
        except:
            pass
    
    for key, value in data.items():
        message = message.replace(f'{{{{{key}}}}}', str(value))
    
    return message

def send_message(channel, message):
    channel_type = channel['type']
    
    if channel_type == 'wecom':
        url = channel['webhook']
        payload = {
            'msgtype': 'text',
            'text': {'content': message}
        }
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()
        
    elif channel_type == 'dingding':
        url = channel['webhook']
        payload = {
            'msgtype': 'text',
            'text': {'content': message}
        }
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()
        
    elif channel_type == 'wxtpl':
        app_id = channel['appId']
        app_secret = channel['appSecret']
        template_id = channel['templateId']
        open_id = channel['openId']
        
        token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={app_id}&secret={app_secret}"
        token_response = requests.get(token_url)
        token_data = token_response.json()
        
        if 'access_token' not in token_data:
            raise Exception(f"获取 AccessToken 失败: {token_data.get('errmsg', '未知错误')}")
        
        access_token = token_data['access_token']
        
        send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
        
        data_payload = {
            'first': {'value': '💡', 'color': '#173177'},
            'nextDate': {'value': '', 'color': '#173177'},
            'daysLeft': {'value': '', 'color': '#173177'}
        }
        
        if isinstance(message, dict):
            if message.get('first'):
                data_payload['first']['value'] = message['first']
            if message.get('nextDate'):
                data_payload['nextDate']['value'] = message['nextDate']
            if message.get('daysLeft'):
                data_payload['daysLeft']['value'] = str(message['daysLeft'])
        else:
            data_payload['first']['value'] = message
        
        payload = {
            'touser': open_id,
            'template_id': template_id,
            'data': data_payload
        }
        
        response = requests.post(send_url, json=payload)
        result = response.json()
        
        if result.get('errcode') != 0:
            raise Exception(f"发送模板消息失败: {result.get('errmsg', '未知错误')}")
        
        return result
        
    else:
        url = channel['webhook']
        payload = {'message': message}
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()

def should_remind(data, remind_days):
    if not data.get('nextPeriodPredicted'):
        print(f"  [Debug] 数据源中无 nextPeriodPredicted 字段，数据: {data}")
        return False
    
    try:
        next_date = datetime.strptime(data['nextPeriodPredicted'], '%Y-%m-%d')
        days_left = (next_date - datetime.now()).days
        print(f"  [Debug] 提醒检查: nextPeriodPredicted={data['nextPeriodPredicted']}, days_left={days_left}, remind_days={remind_days}")
        return 0 <= days_left <= remind_days
    except Exception as e:
        print(f"  [Debug] 日期解析失败: {e}")
        return False

def run():
    print("Starting ZxyAlert...")
    
    try:
        config = fetch_gist_content(CONFIG_GIST_ID, GIST_OWNER)
        print(f"Loaded config: {len(config.get('tasks', []))} tasks, {len(config.get('channels', []))} channels")
        
        for task in config.get('tasks', []):
            if not task.get('enable', True):
                print(f"Skipping disabled task: {task['taskName']}")
                continue
            
            if not is_cron_match(task['cron']):
                print(f"Cron not matched for task: {task['taskName']}")
                continue
            
            channel = next((c for c in config['channels'] if c['id'] == task['channelId']), None)
            if not channel or not channel.get('enable', True):
                print(f"Channel not found or disabled for task: {task['taskName']}")
                continue
            
            print(f"Executing task: {task['taskName']}")
            
            try:
                data_source = task.get('dataSource', {})
                gist_id = data_source.get('gistId', '').strip()
                file_name = data_source.get('fileName', '').strip()
                
                if gist_id and file_name:
                    data_owner = data_source.get('owner') or GIST_OWNER
                    source_data = fetch_gist_content(
                        gist_id,
                        data_owner,
                        file_name
                    )
                    
                    field_map = data_source.get('fieldMap', {})
                    mapped_data = map_fields(source_data, field_map)
                    
                    remind_days = task.get('remindDays', 7)
                    if not should_remind(mapped_data, remind_days):
                        days_left = 0
                        if mapped_data.get('nextPeriodPredicted'):
                            try:
                                next_date = datetime.strptime(mapped_data['nextPeriodPredicted'], '%Y-%m-%d')
                                days_left = (next_date - datetime.now()).days
                            except:
                                pass
                        print(f"Skipping: {days_left} days left (outside remind range)")
                        
                        # 临时测试模式：提醒检查失败时也发送简单消息
                        print(f"  [Debug] 测试模式：发送简单测试消息")
                        if channel['type'] == 'wxtpl':
                            message = {
                                'first': '🔔 测试消息：GitHub Actions 运行成功！',
                                'nextDate': '-',
                                'daysLeft': '-'
                            }
                        else:
                            message = "🔔 测试消息：GitHub Actions 运行成功！提醒条件暂未满足，但流程正常"
                    else:
                        if channel['type'] == 'wxtpl':
                            # 为微信模板消息构建专门的字典格式
                            message = {}
                            today = datetime.now()
                            
                            if mapped_data.get('nextPeriodPredicted'):
                                try:
                                    next_date = datetime.strptime(mapped_data['nextPeriodPredicted'], '%Y-%m-%d')
                                    days_left = (next_date - today).days
                                    message['daysLeft'] = str(days_left)
                                    message['nextDate'] = next_date.strftime('%Y年%m月%d日')
                                    message['first'] = f"距离例假还有 {days_left} 天！"
                                except:
                                    message['first'] = '💡'
                                    message['nextDate'] = '-'
                                    message['daysLeft'] = '-'
                            else:
                                message['first'] = '💡'
                                message['nextDate'] = '-'
                                message['daysLeft'] = '-'
                        else:
                            message = render_message(task.get('message', ''), mapped_data)
                else:
                    if channel['type'] == 'wxtpl':
                        message = {
                            'first': task.get('message', '提醒任务执行'),
                            'nextDate': '-',
                            'daysLeft': '-'
                        }
                    else:
                        message = task.get('message', '提醒任务执行')
                
                send_message(channel, message)
                print(f"Successfully sent message for task: {task['taskName']}")
                
            except Exception as e:
                print(f"Error executing task {task['taskName']}: {e}")
        
        print("ZxyAlert completed")
        
    except Exception as e:
        print(f"Error: {e}")
        raise

if __name__ == '__main__':
    run()