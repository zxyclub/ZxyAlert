import os
import json
import requests
from datetime import datetime
import re

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN')
CONFIG_GIST_ID = os.environ.get('CONFIG_GIST_ID')
GIST_OWNER = os.environ.get('GIST_OWNER')

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

def render_message(template, data, remind_days):
    message = template
    today = datetime.now()
    
    if data.get('lastPeriodDate') and data.get('cycleDays'):
        last_date = datetime.strptime(data['lastPeriodDate'], '%Y-%m-%d')
        next_date = last_date.replace(day=last_date.day + int(data['cycleDays']))
        days_left = (next_date - today).days
        data['daysLeft'] = days_left
        data['nextDate'] = next_date.strftime('%Y年%m月%d日')
        data['lastDate'] = last_date.strftime('%Y年%m月%d日')
    
    for key, value in data.items():
        message = message.replace(f'{{{{{key}}}}}', str(value))
    
    return message

def send_message(channel, message):
    url = channel['webhook']
    
    if channel['type'] == 'wecom':
        payload = {
            'msgtype': 'text',
            'text': {'content': message}
        }
    elif channel['type'] == 'dingding':
        payload = {
            'msgtype': 'text',
            'text': {'content': message}
        }
    else:
        payload = {'message': message}
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json()

def run():
    print("Starting ZxyAlert...")
    
    try:
        config = fetch_gist_content(CONFIG_GIST_ID, GIST_OWNER)
        print(f"Loaded config with {len(config.get('tasks', []))} tasks and {len(config.get('channels', []))} channels")
        
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
                if data_source.get('gistId') and data_source.get('fileName'):
                    source_data = fetch_gist_content(
                        data_source['gistId'],
                        GIST_OWNER,
                        data_source['fileName']
                    )
                    
                    field_map = data_source.get('fieldMap', {})
                    mapped_data = map_fields(source_data, field_map)
                    message = render_message(task.get('message', ''), mapped_data, task.get('remindDays', 3))
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