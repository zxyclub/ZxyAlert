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
                <div class="channel-desc">${(channel.webhook || channel.type === 'wxtpl' ? '微信公众号' : '').substring(0, 50)}${(channel.webhook || '').length > 50 ? '...' : ''}</div>
                <div class="task-actions">
                    <button class="btn btn-secondary" onclick="openEditChannelModal('${channel.id}')">编辑</button>
                    <button class="btn btn-success" onclick="quickTestChannel('${channel.id}')">🧪 测试</button>
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
        webhook: 'Webhook',
        wxtpl: '微信公众平台'
    };
    return types[type] || type;
}

async function quickTestChannel(channelId) {
    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) {
        showToast('渠道不存在', 'error');
        return;
    }

    showToast('正在测试...', 'info');

    try {
        if (channel.type === 'wxtpl') {
            // 微信公众号：触发 GitHub Actions（测试模式）
            await triggerGitHubWorkflow(true);
        } else {
            // 其他渠道：直接发送测试消息
            const message = '这是一条来自 ZxyAlert 的测试消息 🔔';
            let payload = {};
            
            switch (channel.type) {
                case 'wecom':
                    payload = { msgtype: 'text', text: { content: message } };
                    break;
                case 'dingding':
                    payload = { msgtype: 'text', text: { content: message } };
                    break;
                default:
                    payload = { message };
            }

            const response = await fetch(channel.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('发送失败');
            }
            
            showToast('✅ 测试成功！', 'success');
        }
    } catch (err) {
        showToast('测试失败: ' + err.message, 'error');
    }
}

function openAddTaskModal() {
    editingTaskId = null;
    document.getElementById('taskName').value = '';
    document.getElementById('taskCron').value = '0 9 * * *';
    document.getElementById('taskRemindDays').value = '7';
    document.getElementById('taskChannel').value = '';
    document.getElementById('dataSourceGistId').value = '';
    document.getElementById('dataSourceFileName').value = '';
    document.getElementById('taskMessage').value = '💡 距离例假还有 {{daysLeft}} 天！\n📅 预计日期：{{nextDate}}\n💪 保持好心情~';
    document.getElementById('taskEnabled').checked = true;
    document.getElementById('fieldMappingList').innerHTML = `
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="nextPeriodPredicted">
            <input type="text" class="form-input" placeholder="数据源字段" value="nextPeriodPredicted">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="lastPeriodStart">
            <input type="text" class="form-input" placeholder="数据源字段" value="lastPeriodStart">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="cycleLength">
            <input type="text" class="form-input" placeholder="数据源字段" value="cycleLength">
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
    
    if (channel.type === 'wxtpl') {
        // 微信公众号：触发 GitHub Actions（任务模式）
        triggerGitHubWorkflow(false).catch(err => {
            showToast('触发失败: ' + err.message, 'error');
        });
    } else {
        // 其他渠道：直接发送消息
        fetchDataSource(task.dataSource).then(data => {
            const mappedData = mapFields(data, task.dataSource.fieldMap);
            const message = renderMessage(task.message, mappedData, task.remindDays, channel.type);
            return sendMessage(channel, message);
        }).then(() => {
            showToast('任务触发成功', 'success');
        }).catch(err => {
            showToast('触发失败: ' + err.message, 'error');
        });
    }
}

async function fetchDataSource(dataSource) {
    if (!dataSource.gistId || !dataSource.fileName) {
        throw new Error('数据源配置不完整');
    }
    
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);
    const data = await fetchGistContent(dataSource.gistId, owner, dataSource.fileName);
    return data;
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

function renderMessage(template, data, remindDays, channelType) {
    const today = new Date();
    
    // 对于微信公众号模板消息，返回结构化数据而不是渲染后的字符串
    if (channelType === 'wxtpl') {
        const messageData = {};
        
        if (data.nextPeriodPredicted) {
            try {
                const nextDate = new Date(data.nextPeriodPredicted);
                const daysLeft = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
                messageData.daysLeft = String(daysLeft);
                messageData.nextDate = nextDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '年').replace(/(\d{4}年\d{2})/, '$1月').replace(/(\d{4}年\d{2}月\d{2})/, '$1日');
                messageData.first = `距离例假还有 ${daysLeft} 天！`;
            } catch (e) {
                messageData.first = '💡';
                messageData.nextDate = '-';
                messageData.daysLeft = '-';
            }
        } else {
            messageData.first = '💡';
            messageData.nextDate = '-';
            messageData.daysLeft = '-';
        }
        
        return messageData;
    }
    
    // 对于其他渠道，返回渲染后的字符串
    let message = template;
    
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
    if (channel.type === 'wxtpl') {
        // 调用 GitHub API 触发 workflow
        return triggerGitHubWorkflow();
    }

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

async function triggerGitHubWorkflow(isTestMode = false) {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);
    
    if (!token) {
        throw new Error('请先在配置页面设置 GitHub Token');
    }
    if (!owner) {
        throw new Error('请先在配置页面设置 GitHub 用户名');
    }

    // 从 GitHub Pages URL 中获取仓库名
    let repo = 'ZxyAlert'; // 默认值
    try {
        // 尝试从当前页面 URL 推断仓库名
        const pathParts = window.location.pathname.split('/').filter(p => p);
        if (pathParts.length >= 1) {
            // GitHub Pages URL 格式: /repo-name/ 或 /repo-name/index.html
            // 找到第一个可能是仓库名的部分（排除 index.html 等文件名）
            for (const part of pathParts) {
                if (!part.includes('.') && part.length > 0) {
                    repo = part;
                    break;
                }
            }
        }
    } catch (e) {
        // 使用默认值
    }

    const modeText = isTestMode ? '测试模式' : '任务模式';
    showToast(`正在触发 GitHub Actions (${modeText})...`, 'info');

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/run.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({
            ref: 'main',
            inputs: {
                test_mode: isTestMode ? 'true' : 'false'
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`触发失败: ${response.status} - 请确认仓库名是 ${repo}，分支是 main，且 Token 有 repo 权限\n\n错误详情: ${errorText}`);
    }

    showToast(`✅ GitHub Actions 已触发 (${modeText})！请稍等片刻查看微信消息`, 'success');
    return Promise.resolve();
}

function updateChannelConfig() {
    const type = document.getElementById('channelType').value;
    document.getElementById('webhookGroup').style.display = type === 'wxtpl' ? 'none' : 'block';
    document.getElementById('appIdGroup').style.display = type === 'wxtpl' ? 'block' : 'none';
    document.getElementById('appSecretGroup').style.display = type === 'wxtpl' ? 'block' : 'none';
    document.getElementById('templateIdGroup').style.display = type === 'wxtpl' ? 'block' : 'none';
    document.getElementById('openIdGroup').style.display = type === 'wxtpl' ? 'block' : 'none';
}

function openAddChannelModal() {
    editingChannelId = null;
    document.querySelector('#channelModal h3').textContent = '📡 新建推送渠道';
    document.getElementById('channelName').value = '';
    document.getElementById('channelType').value = 'wecom';
    document.getElementById('channelWebhook').value = '';
    document.getElementById('channelAppId').value = '';
    document.getElementById('channelAppSecret').value = '';
    document.getElementById('channelTemplateId').value = '';
    document.getElementById('channelOpenId').value = '';
    document.getElementById('channelEnabled').checked = true;
    
    // 新建模式：启用所有输入
    document.getElementById('channelName').disabled = false;
    document.getElementById('channelType').disabled = false;
    document.getElementById('channelWebhook').disabled = false;
    document.getElementById('channelAppId').disabled = false;
    document.getElementById('channelAppSecret').disabled = false;
    document.getElementById('channelTemplateId').disabled = false;
    document.getElementById('channelOpenId').disabled = false;
    document.getElementById('channelEnabled').disabled = false;
    document.querySelector('#channelModal .modal-btns').style.display = '';
    
    updateChannelConfig();
    document.getElementById('channelModal').classList.add('show');
}

function openEditChannelModal(channelId) {
    editingChannelId = channelId;
    const channel = config.channels.find(c => c.id === channelId);
    if (!channel) return;

    document.querySelector('#channelModal h3').textContent = '📡 编辑推送渠道';
    document.getElementById('channelName').value = channel.name;
    document.getElementById('channelType').value = channel.type;
    document.getElementById('channelWebhook').value = channel.webhook || '';
    document.getElementById('channelAppId').value = channel.appId || '';
    document.getElementById('channelAppSecret').value = channel.appSecret || '';
    document.getElementById('channelTemplateId').value = channel.templateId || '';
    document.getElementById('channelOpenId').value = channel.openId || '';
    document.getElementById('channelEnabled').checked = channel.enable;
    
    // 编辑模式：启用所有输入
    document.getElementById('channelName').disabled = false;
    document.getElementById('channelType').disabled = false;
    document.getElementById('channelWebhook').disabled = false;
    document.getElementById('channelAppId').disabled = false;
    document.getElementById('channelAppSecret').disabled = false;
    document.getElementById('channelTemplateId').disabled = false;
    document.getElementById('channelOpenId').disabled = false;
    document.getElementById('channelEnabled').disabled = false;
    document.querySelector('#channelModal .modal-btns').style.display = '';
    
    updateChannelConfig();
    document.getElementById('channelModal').classList.add('show');
}

function closeChannelModal() {
    document.getElementById('channelModal').classList.remove('show');
    editingChannelId = null;
}

function saveChannel() {
    const type = document.getElementById('channelType').value;
    const channelData = {
        id: editingChannelId || Date.now().toString(),
        name: document.getElementById('channelName').value.trim(),
        type: type,
        enable: document.getElementById('channelEnabled').checked
    };

    if (type === 'wxtpl') {
        channelData.appId = document.getElementById('channelAppId').value.trim();
        channelData.appSecret = document.getElementById('channelAppSecret').value.trim();
        channelData.templateId = document.getElementById('channelTemplateId').value.trim();
        channelData.openId = document.getElementById('channelOpenId').value.trim();
        
        if (!channelData.appId) {
            showToast('请输入 AppID', 'error');
            return;
        }
        if (!channelData.appSecret) {
            showToast('请输入 AppSecret', 'error');
            return;
        }
        if (!channelData.templateId) {
            showToast('请输入模板消息 ID', 'error');
            return;
        }
        if (!channelData.openId) {
            showToast('请输入用户 OpenID', 'error');
            return;
        }
    } else {
        channelData.webhook = document.getElementById('channelWebhook').value.trim();
        if (!channelData.webhook) {
            showToast('请输入 Webhook 地址', 'error');
            return;
        }
    }

    if (!channelData.name) {
        showToast('请输入渠道名称', 'error');
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

function fetchGistContent(gistId, owner, fileName = null) {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const headers = {
        'Accept': 'application/vnd.github+json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(`https://api.github.com/gists/${gistId}`, {
        headers: headers
    }).then(response => {
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Gist 不存在或无权访问');
            }
            throw new Error('获取配置失败');
        }
        return response.json();
    }).then(gist => {
        if (fileName) {
            if (gist.files && gist.files[fileName]) {
                return JSON.parse(gist.files[fileName].content);
            }
            throw new Error(`文件中未找到: ${fileName}`);
        }
        const files = Object.keys(gist.files || {});
        if (files.length > 0) {
            return JSON.parse(gist.files[files[0]].content);
        }
        return {};
    });
}

function syncConfig() {
    const gistId = localStorage.getItem(STORAGE_KEY_GIST_ID);
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);

    if (!gistId || !owner) {
        showToast('请先配置 Gist ID 和用户名', 'error');
        return;
    }

    showToast('正在同步配置...', 'info');

    fetchGistContent(gistId, owner)
    .then(configData => {
        config = configData;
        saveConfig();
        renderTasks();
        renderChannels();
        showToast('配置同步成功', 'success');
    })
    .catch(err => {
        showToast('同步失败: ' + err.message, 'error');
    });
}

function saveConfigToGist() {
    const gistId = localStorage.getItem(STORAGE_KEY_GIST_ID);
    const owner = localStorage.getItem(STORAGE_KEY_OWNER);
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);

    if (!gistId || !owner || !token) {
        showToast('保存到 Gist 需要配置 Token、Gist ID 和用户名', 'error');
        return;
    }

    showToast('正在保存配置到 Gist...', 'info');

    const fileName = 'zxyalert-config.json';
    
    fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({
            files: {
                [fileName]: {
                    content: JSON.stringify(config, null, 2)
                }
            }
        })
    }).then(response => {
        if (!response.ok) throw new Error('保存配置失败');
        showToast('配置已保存到 Gist', 'success');
    }).catch(err => {
        showToast('保存失败: ' + err.message, 'error');
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