const STORAGE_KEY_CONFIG = 'zxyalert_config';
const STORAGE_KEY_TOKEN = 'github_token';
const STORAGE_KEY_GIST_ID = 'config_gist_id';
const STORAGE_KEY_OWNER = 'github_owner';

let config = {
    channels: [],
    tasks: []
};

let editingTaskId = null;
let editingChannelId = null;

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function loadSettings() {
    document.getElementById('githubToken').value = localStorage.getItem(STORAGE_KEY_TOKEN) || '';
    document.getElementById('configGistId').value = localStorage.getItem(STORAGE_KEY_GIST_ID) || '';
    document.getElementById('githubOwner').value = localStorage.getItem(STORAGE_KEY_OWNER) || '';
}

function saveSettings() {
    const token = document.getElementById('githubToken').value;
    const gistId = document.getElementById('configGistId').value;
    const owner = document.getElementById('githubOwner').value;

    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_GIST_ID, gistId);
    localStorage.setItem(STORAGE_KEY_OWNER, owner);

    showToast('配置已保存', 'success');
    updateConfigPreview();
}

function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
        try {
            config = JSON.parse(saved);
        } catch (e) {
            config = { channels: [], tasks: [] };
        }
    }
    renderTasks();
    renderChannels();
    updateConfigPreview();
}

function saveConfig() {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config, null, 2));
    updateConfigPreview();
}

function updateConfigPreview() {
    document.getElementById('configPreview').textContent = JSON.stringify(config, null, 2);
}

function renderTasks() {
    const container = document.getElementById('taskList');
    if (config.tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无任务</p>
                <button class="btn btn-primary" onclick="openAddTaskModal()">创建第一个任务</button>
            </div>
        `;
        return;
    }

    container.innerHTML = config.tasks.map(task => {
        const channel = config.channels.find(c => c.id === task.channelId);
        const statusClass = task.enable ? 'enabled' : 'disabled';
        const statusText = task.enable ? '已启用' : '已禁用';
        return `
            <div class="task-item">
                <div class="task-header">
                    <span class="task-name">📋 ${task.taskName}</span>
                    <span class="task-status ${statusClass}">${statusText}</span>
                </div>
                <div class="task-info">
                    <span>⏰ ${task.cron}</span>
                    <span>📅 提前 ${task.remindDays} 天</span>
                    <span>📡 ${channel ? channel.name : '未配置渠道'}</span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-secondary" onclick="openEditTaskModal('${task.id}')">编辑</button>
                    <button class="btn btn-secondary" onclick="triggerTask('${task.id}')">手动触发</button>
                    <button class="btn btn-danger" onclick="deleteTask('${task.id}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderChannels() {
    const container = document.getElementById('channelList');
    const select = document.getElementById('taskChannel');

    if (config.channels.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无推送渠道</p>
                <button class="btn btn-primary" onclick="openAddChannelModal()">添加推送渠道</button>
            </div>
        `;
        select.innerHTML = '<option value="">请先添加渠道</option>';
        return;
    }

    container.innerHTML = config.channels.map(channel => {
        const typeText = getChannelTypeText(channel.type);
        return `
            <div class="channel-item">
                <div class="channel-header">
                    <span class="channel-name">📡 ${channel.name}</span>
                    <span class="channel-type">${typeText}</span>
                </div>
                <div class="channel-desc">${channel.webhook.substring(0, 50)}${channel.webhook.length > 50 ? '...' : ''}</div>
                <div class="task-actions">
                    <button class="btn btn-secondary" onclick="openEditChannelModal('${channel.id}')">编辑</button>
                    <button class="btn btn-secondary" onclick="testChannelById('${channel.id}')">测试</button>
                    <button class="btn btn-danger" onclick="deleteChannel('${channel.id}')">删除</button>
                </div>
            </div>
        `;
    }).join('');

    select.innerHTML = config.channels.map(c => 
        `<option value="${c.id}">${c.name}</option>`
    ).join('');
}

function getChannelTypeText(type) {
    const types = {
        wecom: '企业微信',
        dingding: '钉钉',
        webhook: 'Webhook'
    };
    return types[type] || type;
}

function openAddTaskModal() {
    editingTaskId = null;
    document.getElementById('taskName').value = '';
    document.getElementById('taskCron').value = '0 8 * * *';
    document.getElementById('taskRemindDays').value = '3';
    document.getElementById('taskChannel').value = '';
    document.getElementById('dataSourceGistId').value = '';
    document.getElementById('dataSourceFileName').value = '';
    document.getElementById('taskMessage').value = '提醒：距离目标日期还有 {{daysLeft}} 天';
    document.getElementById('taskEnabled').checked = true;
    document.getElementById('fieldMappingList').innerHTML = `
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="lastPeriodDate">
            <input type="text" class="form-input" placeholder="数据源字段" value="lastPeriodDate">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="cycleDays">
            <input type="text" class="form-input" placeholder="数据源字段" value="cycleDays">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
    `;
    updateCronPreview();
    document.getElementById('taskModal').classList.add('show');
}

function openEditTaskModal(taskId) {
    editingTaskId = taskId;
    const task = config.tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('taskName').value = task.taskName;
    document.getElementById('taskCron').value = task.cron;
    document.getElementById('taskRemindDays').value = task.remindDays;
    document.getElementById('taskChannel').value = task.channelId || '';
    document.getElementById('taskMessage').value = task.message || '提醒：距离目标日期还有 {{daysLeft}} 天';
    document.getElementById('taskEnabled').checked = task.enable;

    if (task.dataSource) {
        document.getElementById('dataSourceGistId').value = task.dataSource.gistId || '';
        document.getElementById('dataSourceFileName').value = task.dataSource.fileName || '';
        
        let fieldHtml = '';
        if (task.dataSource.fieldMap) {
            Object.keys(task.dataSource.fieldMap).forEach(key => {
                fieldHtml += `
                    <div class="field-mapping-item">
                        <input type="text" class="form-input" placeholder="映射字段名" value="${key}">
                        <input type="text" class="form-input" placeholder="数据源字段" value="${task.dataSource.fieldMap[key]}">
                        <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
                    </div>
                `;
            });
        }
        document.getElementById('fieldMappingList').innerHTML = fieldHtml || `
            <div class="field-mapping-item">
                <input type="text" class="form-input" placeholder="映射字段名">
                <input type="text" class="form-input" placeholder="数据源字段">
                <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
            </div>
        `;
    }

    updateCronPreview();
    document.getElementById('taskModal').classList.add('show');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('show');
    editingTaskId = null;
}

function addFieldMapping() {
    const container = document.getElementById('fieldMappingList');
    container.innerHTML += `
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名">
            <input type="text" class="form-input" placeholder="数据源字段">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
    `;
}

function removeFieldMapping(btn) {
    btn.parentElement.remove();
}

function saveTask() {
    const fieldItems = document.querySelectorAll('#fieldMappingList .field-mapping-item');
    const fieldMap = {};
    fieldItems.forEach(item => {
        const key = item.children[0].value.trim();
        const value = item.children[1].value.trim();
        if (key && value) {
            fieldMap[key] = value;
        }
    });

    const taskData = {
        id: editingTaskId || Date.now().toString(),
        taskName: document.getElementById('taskName').value.trim(),
        cron: document.getElementById('taskCron').value.trim(),
        remindDays: parseInt(document.getElementById('taskRemindDays').value) || 3,
        channelId: document.getElementById('taskChannel').value,
        message: document.getElementById('taskMessage').value.trim(),
        enable: document.getElementById('taskEnabled').checked,
        dataSource: {
            gistId: document.getElementById('dataSourceGistId').value.trim(),
            fileName: document.getElementById('dataSourceFileName').value.trim(),
            fieldMap: fieldMap
        }
    };

    if (!taskData.taskName) {
        showToast('请输入任务名称', 'error');
        return;
    }

    if (!taskData.cron) {
        showToast('请输入 Cron 表达式', 'error');
        return;
    }

    if (!taskData.channelId) {
        showToast('请选择推送渠道', 'error');
        return;
    }

    if (editingTaskId) {
        const index = config.tasks.findIndex(t => t.id === editingTaskId);
        if (index !== -1) {
            config.tasks[index] = taskData;
        }
        showToast('任务已更新', 'success');
    } else {
        config.tasks.push(taskData);
        showToast('任务已创建', 'success');
    }

    saveConfig();
    renderTasks();
    closeTaskModal();
}

function deleteTask(taskId) {
    if (confirm('确定要删除这个任务吗？')) {
        config.tasks = config.tasks.filter(t => t.id !== taskId);
        saveConfig();
        renderTasks();
        showToast('任务已删除', 'success');
    }
}

function triggerTask(taskId) {
    const task = config.tasks.find(t => t.id === taskId);
    if (!task) return;

    const channel = config.channels.find(c => c.id === task.channelId);
    if (!channel) {
        showToast('渠道不存在', 'error');
        return;
    }

    showToast('正在触发任务...', 'info');
    
    fetchDataSource(task.dataSource).then(data => {
        const mappedData = mapFields(data, task.dataSource.fieldMap);
        const message = renderMessage(task.message, mappedData, task.remindDays);
        return sendMessage(channel, message);
    }).then(() => {
        showToast('任务触发成功', 'success');
    }).catch(err => {
        showToast('触发失败: ' + err.message, 'error');
    });
}

async function fetchDataSource(dataSource) {
    if (!dataSource.gistId || !dataSource.fileName) {
        throw new Error('数据源配置不完整');
    }
    
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);
    const url = `https://gist.githubusercontent.com/${owner}/${dataSource.gistId}/raw/${dataSource.fileName}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('获取数据源失败');
    }
    return await response.json();
}

function mapFields(data, fieldMap) {
    const result = {};
    Object.keys(fieldMap).forEach(key => {
        const sourceKey = fieldMap[key];
        result[key] = getNestedValue(data, sourceKey);
    });
    return result;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((o, key) => (o && o[key] !== undefined) ? o[key] : null, obj);
}

function renderMessage(template, data, remindDays) {
    let message = template;
    const today = new Date();
    
    if (data.lastPeriodDate && data.cycleDays) {
        const lastDate = new Date(data.lastPeriodDate);
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + parseInt(data.cycleDays));
        const daysLeft = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        data.daysLeft = daysLeft;
        data.nextDate = nextDate.toLocaleDateString('zh-CN');
        data.lastDate = lastDate.toLocaleDateString('zh-CN');
    }

    Object.keys(data).forEach(key => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
    });

    return message;
}

async function sendMessage(channel, message) {
    if (!channel.webhook) {
        throw new Error('渠道 Webhook 未配置');
    }

    let payload = {};
    switch (channel.type) {
        case 'wecom':
            payload = {
                msgtype: 'text',
                text: {
                    content: message
                }
            };
            break;
        case 'dingding':
            payload = {
                msgtype: 'text',
                text: {
                    content: message
                }
            };
            break;
        default:
            payload = { message };
    }

    const response = await fetch(channel.webhook, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('推送失败');
    }

    return await response.json();
}

function openAddChannelModal() {
    editingChannelId = null;
    document.getElementById('channelName').value = '';
    document.getElementById('channelType').value = 'wecom';
    document.getElementById('channelWebhook').value = '';
    document.getElementById('channelEnabled').checked = true;
    document.getElementById('testMessage').value = '这是一条来自 ZxyAlert 的测试消息 🔔';
    document.getElementById('testResult').innerHTML = '';
    document.getElementById('channelModal').classList.add('show');
}

function openEditChannelModal(channelId) {
    editingChannelId = channelId;
    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) return;

    document.getElementById('channelName').value = channel.name;
    document.getElementById('channelType').value = channel.type;
    document.getElementById('channelWebhook').value = channel.webhook;
    document.getElementById('channelEnabled').checked = channel.enable;
    document.getElementById('testMessage').value = '这是一条来自 ZxyAlert 的测试消息 🔔';
    document.getElementById('testResult').innerHTML = '';
    document.getElementById('channelModal').classList.add('show');
}

function closeChannelModal() {
    document.getElementById('channelModal').classList.remove('show');
    editingChannelId = null;
}

function saveChannel() {
    const channelData = {
        id: editingChannelId || Date.now().toString(),
        name: document.getElementById('channelName').value.trim(),
        type: document.getElementById('channelType').value,
        webhook: document.getElementById('channelWebhook').value.trim(),
        enable: document.getElementById('channelEnabled').checked
    };

    if (!channelData.name) {
        showToast('请输入渠道名称', 'error');
        return;
    }

    if (!channelData.webhook) {
        showToast('请输入 Webhook 地址', 'error');
        return;
    }

    if (editingChannelId) {
        const index = config.channels.findIndex(c => c.id === editingChannelId);
        if (index !== -1) {
            config.channels[index] = channelData;
        }
        showToast('渠道已更新', 'success');
    } else {
        config.channels.push(channelData);
        showToast('渠道已创建', 'success');
    }

    saveConfig();
    renderChannels();
    closeChannelModal();
}

function deleteChannel(channelId) {
    if (config.tasks.some(t => t.channelId === channelId)) {
        showToast('该渠道正在被任务使用，无法删除', 'error');
        return;
    }

    if (confirm('确定要删除这个渠道吗？')) {
        config.channels = config.channels.filter(c => c.id !== channelId);
        saveConfig();
        renderChannels();
        showToast('渠道已删除', 'success');
    }
}

async function testChannel() {
    const webhook = document.getElementById('channelWebhook').value;
    const type = document.getElementById('channelType').value;
    const message = document.getElementById('testMessage').value;

    if (!webhook) {
        showToast('请先输入 Webhook 地址', 'error');
        return;
    }

    const resultDiv = document.getElementById('testResult');
    resultDiv.innerHTML = '<div class="test-result info">发送中...</div>';

    try {
        let payload = {};
        switch (type) {
            case 'wecom':
                payload = { msgtype: 'text', text: { content: message } };
                break;
            case 'dingding':
                payload = { msgtype: 'text', text: { content: message } };
                break;
            default:
                payload = { message };
        }

        const response = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            resultDiv.innerHTML = '<div class="test-result success">✓ 测试成功！</div>';
        } else {
            resultDiv.innerHTML = '<div class="test-result error">✗ 测试失败</div>';
        }
    } catch (err) {
        resultDiv.innerHTML = `<div class="test-result error">✗ ${err.message}</div>`;
    }
}

function testChannelById(channelId) {
    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) return;

    document.getElementById('channelName').value = channel.name;
    document.getElementById('channelType').value = channel.type;
    document.getElementById('channelWebhook').value = channel.webhook;
    document.getElementById('channelEnabled').checked = channel.enable;
    document.getElementById('testMessage').value = '这是一条来自 ZxyAlert 的测试消息 🔔';
    document.getElementById('channelModal').classList.add('show');
}

function updateCronPreview() {
    const cron = document.getElementById('taskCron').value;
    const preview = document.getElementById('cronPreview');
    preview.textContent = cron ? `执行时间: ${parseCron(cron)}` : '';
}

function parseCron(cron) {
    const parts = cron.split(' ');
    if (parts.length !== 5) return '无效的 Cron 表达式';

    const [minute, hour, day, month, weekday] = parts;
    
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    let result = '';
    if (hour === '*') result += '每小时 ';
    else result += `${hour}点 `;
    
    if (minute === '*') result += '每分钟';
    else result += `${minute}分`;
    
    if (day !== '*') result += `, 每月${day}日`;
    if (month !== '*') result += `, ${month}月`;
    if (weekday !== '*') {
        const days = weekday.split(',').map(d => {
            const num = parseInt(d);
            return num >= 0 && num <= 6 ? weekDays[num] : d;
        }).join('、');
        result += `, 周${days}`;
    }
    
    return result;
}

function syncConfig() {
    const gistId = localStorage.getItem(STORAGE_KEY_GIST_ID);
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);

    if (!gistId || !owner) {
        showToast('请先配置 Gist ID 和用户名', 'error');
        return;
    }

    showToast('正在同步配置...', 'info');

    fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
            'Authorization': token ? `Bearer ${token}` : undefined,
            'Accept': 'application/vnd.github+json'
        }
    }).then(response => {
        if (!response.ok) throw new Error('获取配置失败');
        return response.json();
    }).then(gist => {
        const files = Object.keys(gist.files);
        if (files.length === 0) throw new Error('Gist 中没有文件');
        
        const content = gist.files[files[0]].content;
        config = JSON.parse(content);
        saveConfig();
        renderTasks();
        renderChannels();
        showToast('配置同步成功', 'success');
    }).catch(err => {
        showToast('同步失败: ' + err.message, 'error');
    });
}

function exportConfig() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zxyalert-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('配置已导出', 'success');
}

function resetConfig() {
    if (confirm('确定要重置所有配置吗？这将清空所有任务和渠道配置！')) {
        config = { channels: [], tasks: [] };
        saveConfig();
        renderTasks();
        renderChannels();
        showToast('配置已重置', 'success');
    }
}

function switchSection(sectionId) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${sectionId}Section`).classList.add('active');
}

function loadAvatar() {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (token) {
        fetch('https://api.github.com/user', {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Accept': 'application/vnd.github+json'
            }
        }).then(res => res.json())
        .then(data => {
            if (data.avatar_url) {
                document.getElementById('avatar').src = data.avatar_url;
            }
        }).catch(() => {});
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadConfig();
    loadAvatar();
    updateConfigPreview();

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchSection(tab.dataset.section);
        });
    });

    document.getElementById('taskCron').addEventListener('input', updateCronPreview);

    document.getElementById('taskModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('taskModal')) closeTaskModal();
    });

    document.getElementById('channelModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('channelModal')) closeChannelModal();
    });
});