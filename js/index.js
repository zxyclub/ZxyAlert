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
let confirmCallback = null;

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function verifyAndLoadConfig() {
    const token = document.getElementById('githubToken').value;
    
    if (!token) {
        showToast('请输入 Token', 'error');
        return;
    }

    showToast('正在验证 Token...', 'info');

    try {
        // 验证 token 并获取用户信息
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!userResponse.ok) {
            throw new Error('Token 无效');
        }

        const userData = await userResponse.json();
        const owner = userData.login;

        // 保存 token 和 owner
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
        localStorage.setItem(STORAGE_KEY_OWNER, owner);

        showToast('Token 验证成功！正在加载配置...', 'success');

        // 自动查找 gist 并加载配置
        await autoFindAndLoadGist(token, owner);

    } catch (error) {
        showToast('验证失败: ' + error.message, 'error');
    }
}

async function autoFindAndLoadGist(token, owner) {
    try {
        let page = 1;
        const perPage = 100;

        while (true) {
            const gistResponse = await fetch(`https://api.github.com/gists?page=${page}&per_page=${perPage}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json'
                }
            });

            if (!gistResponse.ok) {
                throw new Error('获取 Gist 列表失败');
            }

            const gists = await gistResponse.json();

            if (gists.length === 0) {
                break;
            }

            for (const gist of gists) {
                if (gist.files && gist.files['zxyalert-config.json']) {
                    // 找到配置 gist，加载它
                    localStorage.setItem(STORAGE_KEY_GIST_ID, gist.id);
                    
                    const configData = await fetchGistFile(gist.id, owner, 'zxyalert-config.json');
                    config = validateConfig(configData);
                    saveConfig();
                    renderTasks();
                    renderChannels();
                    updateConfigPreview();

                    showToast('✅ 配置加载成功！', 'success');
                    return;
                }
            }

            page++;
        }

        // 没找到配置 gist，创建新的
        showToast('未找到配置文件，将创建新配置', 'info');
        config = { channels: [], tasks: [] };
        await createNewConfigGist(token, owner);
        saveConfig();
        renderTasks();
        renderChannels();
        updateConfigPreview();
        showToast('✅ 新配置已创建！', 'success');

    } catch (error) {
        showToast('加载配置失败: ' + error.message, 'error');
    }
}

async function fetchGistFile(gistId, owner, fileName) {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json'
        }
    });

    if (!response.ok) {
        throw new Error('获取 Gist 文件失败');
    }

    const gist = await response.json();
    if (gist.files && gist.files[fileName]) {
        return JSON.parse(gist.files[fileName].content);
    }
    throw new Error('文件中未找到: ' + fileName);
}

async function createNewConfigGist(token, owner) {
    const response = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json'
        },
        body: JSON.stringify({
            description: 'ZxyAlert 配置文件',
            public: false,
            files: {
                'zxyalert-config.json': {
                    content: JSON.stringify(config, null, 2)
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error('创建 Gist 失败');
    }

    const gist = await response.json();
    localStorage.setItem(STORAGE_KEY_GIST_ID, gist.id);
    showToast('已创建新的配置 Gist', 'success');
}

function showClearTokenConfirm() {
    openConfirmModal('清除 Token', '确定要清除所有配置信息吗？', () => {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_GIST_ID);
        localStorage.removeItem(STORAGE_KEY_OWNER);
        localStorage.removeItem(STORAGE_KEY_CONFIG);
        document.getElementById('githubToken').value = '';
        config = { channels: [], tasks: [] };
        renderTasks();
        renderChannels();
        updateConfigPreview();
        showToast('Token 已清除', 'success');
    });
}

function openConfirmModal(title, message, callback) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('show');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
    confirmCallback = null;
}

function handleConfirm() {
    if (confirmCallback) {
        confirmCallback();
        closeConfirmModal();
    }
}

function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
        try {
            const loadedConfig = JSON.parse(saved);
            config = validateConfig(loadedConfig);
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

// XSS 防护：转义 HTML 特殊字符
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 深度转义对象中的字符串值
function escapeConfigValues(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return escapeHtml(obj);
    if (Array.isArray(obj)) return obj.map(escapeConfigValues);
    if (typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = escapeConfigValues(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
}

// 验证配置对象结构，防止恶意注入
function validateConfig(loadedConfig) {
    if (!loadedConfig || typeof loadedConfig !== 'object') {
        throw new Error('配置格式无效');
    }
    
    const safeConfig = {
        channels: [],
        tasks: []
    };
    
    // 验证并清理 channels
    if (Array.isArray(loadedConfig.channels)) {
        safeConfig.channels = loadedConfig.channels.map(channel => ({
            id: String(channel.id || Date.now() + Math.random()).slice(0, 50),
            name: escapeHtml(String(channel.name || '')).slice(0, 200),
            type: ['wecom', 'dingding', 'webhook', 'wxtpl'].includes(channel.type) ? channel.type : 'wecom',
            enable: typeof channel.enable === 'boolean' ? channel.enable : true,
            webhook: typeof channel.webhook === 'string' ? escapeHtml(channel.webhook).slice(0, 500) : '',
            appId: typeof channel.appId === 'string' ? escapeHtml(channel.appId).slice(0, 200) : '',
            appSecret: typeof channel.appSecret === 'string' ? escapeHtml(channel.appSecret).slice(0, 200) : '',
            templateId: typeof channel.templateId === 'string' ? escapeHtml(channel.templateId).slice(0, 200) : '',
            openId: typeof channel.openId === 'string' ? escapeHtml(channel.openId).slice(0, 200) : ''
        }));
    }
    
    // 验证并清理 tasks
    if (Array.isArray(loadedConfig.tasks)) {
        safeConfig.tasks = loadedConfig.tasks.map(task => ({
            id: String(task.id || Date.now() + Math.random()).slice(0, 50),
            taskName: escapeHtml(String(task.taskName || '')).slice(0, 200),
            cron: escapeHtml(String(task.cron || '0 8 * * *')).slice(0, 50),
            remindDays: parseInt(task.remindDays) || 3,
            channelId: escapeHtml(String(task.channelId || '')).slice(0, 50),
            message: escapeHtml(String(task.message || '')).slice(0, 1000),
            enable: typeof task.enable === 'boolean' ? task.enable : true,
            dataSource: {
                gistId: escapeHtml(String(task.dataSource?.gistId || '')).slice(0, 100),
                fileName: escapeHtml(String(task.dataSource?.fileName || '')).slice(0, 200),
                dataType: ['single', 'list'].includes(task.dataSource?.dataType) ? task.dataSource.dataType : 'single',
                dateField: escapeHtml(String(task.dataSource?.dateField || '')).slice(0, 50),
                titleField: escapeHtml(String(task.dataSource?.titleField || '')).slice(0, 50),
                timeField: escapeHtml(String(task.dataSource?.timeField || '')).slice(0, 50),
                fieldMap: {}
            }
        }));

        // 单独处理 fieldMap
        safeConfig.tasks.forEach((task, index) => {
            const originalFieldMap = loadedConfig.tasks[index]?.dataSource?.fieldMap;
            if (originalFieldMap && typeof originalFieldMap === 'object') {
                for (const key in originalFieldMap) {
                    if (Object.prototype.hasOwnProperty.call(originalFieldMap, key)) {
                        task.dataSource.fieldMap[escapeHtml(key).slice(0, 100)] =
                            escapeHtml(String(originalFieldMap[key])).slice(0, 200);
                    }
                }
            }
        });
    }
    
    return safeConfig;
}

// 导出配置
function exportConfig() {
    const dataStr = JSON.stringify(config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `zxyalert-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('配置已导出！', 'success');
}

// 导入配置
function importConfig() {
    document.getElementById('configFileInput').click();
}

// 处理导入的配置文件
function handleConfigFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedConfig = JSON.parse(e.target.result);
            const safeConfig = validateConfig(loadedConfig);
            
            openConfirmModal('确认导入', '导入将覆盖当前配置，确定继续吗？', async () => {
                config = safeConfig;
                saveConfig();
                renderTasks();
                renderChannels();
                updateConfigPreview();
                
                // 自动上传到 Gist（如果已登录）
                await uploadConfigToGist();
                showToast('配置已成功导入！', 'success');
            });
        } catch (error) {
            showToast('配置导入失败：' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    
    // 重置文件输入，允许重复导入相同文件
    event.target.value = '';
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
                    <span class="task-name">📋 ${escapeHtml(task.taskName)}</span>
                    <span class="task-status ${statusClass}">${statusText}</span>
                </div>
                <div class="task-info">
                    <span>⏰ ${escapeHtml(task.cron)}</span>
                    <span>📅 提前 ${task.remindDays} 天</span>
                    <span>📡 ${channel ? escapeHtml(channel.name) : '未配置渠道'}</span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-secondary" onclick="openEditTaskModal('${escapeHtml(task.id)}')">编辑</button>
                    <button class="btn btn-secondary" onclick="triggerTask('${escapeHtml(task.id)}')">🧪 手动触发</button>
                    <button class="btn btn-danger" onclick="deleteTask('${escapeHtml(task.id)}')">删除</button>
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
        const webhookDisplay = channel.type === 'wxtpl' ? '微信公众号' : (channel.webhook || '');
        return `
            <div class="channel-item">
                <div class="channel-header">
                    <span class="channel-name">📡 ${escapeHtml(channel.name)}</span>
                    <span class="channel-type">${escapeHtml(typeText)}</span>
                </div>
                <div class="channel-desc">${escapeHtml(webhookDisplay.substring(0, 50))}${webhookDisplay.length > 50 ? '...' : ''}</div>
                <div class="task-actions">
                    <button class="btn btn-secondary" onclick="openEditChannelModal('${escapeHtml(channel.id)}')">编辑</button>
                    <button class="btn btn-secondary" onclick="quickTestChannel('${escapeHtml(channel.id)}')">🧪 测试</button>
                    <button class="btn btn-danger" onclick="deleteChannel('${escapeHtml(channel.id)}')">删除</button>
                </div>
            </div>
        `;
    }).join('');

    select.innerHTML = config.channels.map(c => 
        `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`
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

    openConfirmModal('确认测试', `确定要测试推送渠道 "${channel.name}" 吗？`, async () => {
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
    });
}

function openAddTaskModal() {
    editingTaskId = null;
    document.getElementById('taskName').value = '';
    document.getElementById('taskCron').value = '0 9 * * *';
    document.getElementById('taskRemindDays').value = '7';
    document.getElementById('taskChannel').value = '';
    document.getElementById('dataSourceGistId').value = '';
    document.getElementById('dataSourceFileName').value = '';
    document.getElementById('dataSourceType').value = 'single';
    document.getElementById('dataSourceDateField').value = '';
    document.getElementById('dataSourceTitleField').value = '';
    document.getElementById('dataSourceTimeField').value = '';
    document.getElementById('taskMessage').value = '💡 提醒：距离目标日期还有 {{daysLeft}} 天！\n📅 预计日期：{{nextDate}}';
    document.getElementById('taskEnabled').checked = true;
    document.getElementById('fieldMappingList').innerHTML = `
        <div class="field-mapping-item">
            <input type="text" class="form-input" placeholder="映射字段名" value="targetDate">
            <input type="text" class="form-input" placeholder="数据源字段" value="targetDate">
            <button class="remove-field" onclick="removeFieldMapping(this)">×</button>
        </div>
    `;
    updateDataSourceFields();
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
        document.getElementById('dataSourceType').value = task.dataSource.dataType || 'single';
        document.getElementById('dataSourceDateField').value = task.dataSource.dateField || '';
        document.getElementById('dataSourceTitleField').value = task.dataSource.titleField || '';
        document.getElementById('dataSourceTimeField').value = task.dataSource.timeField || '';

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

    updateDataSourceFields();
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

function updateDataSourceFields() {
    const dataType = document.getElementById('dataSourceType').value;
    const singleFields = document.getElementById('singleFields');
    const listFields = document.getElementById('listFields');
    const singleMessageGroup = document.getElementById('singleMessageGroup');

    if (dataType === 'list') {
        singleFields.style.display = 'none';
        listFields.style.display = 'block';
        singleMessageGroup.style.display = 'none';
    } else {
        singleFields.style.display = 'block';
        listFields.style.display = 'none';
        singleMessageGroup.style.display = 'block';
    }
}

async function saveTask() {
    const fieldItems = document.querySelectorAll('#fieldMappingList .field-mapping-item');
    const fieldMap = {};
    fieldItems.forEach(item => {
        const key = escapeHtml(item.children[0].value.trim());
        const value = escapeHtml(item.children[1].value.trim());
        if (key && value) {
            fieldMap[key] = value;
        }
    });

    const dataType = document.getElementById('dataSourceType').value;

    const taskData = {
        id: editingTaskId || Date.now().toString(),
        taskName: escapeHtml(document.getElementById('taskName').value.trim()),
        cron: escapeHtml(document.getElementById('taskCron').value.trim()),
        remindDays: parseInt(document.getElementById('taskRemindDays').value) || 3,
        channelId: escapeHtml(document.getElementById('taskChannel').value),
        message: escapeHtml(document.getElementById('taskMessage').value.trim()),
        enable: document.getElementById('taskEnabled').checked,
        dataSource: {
            gistId: escapeHtml(document.getElementById('dataSourceGistId').value.trim()),
            fileName: escapeHtml(document.getElementById('dataSourceFileName').value.trim()),
            dataType: dataType,
            dateField: escapeHtml(document.getElementById('dataSourceDateField').value.trim()),
            titleField: escapeHtml(document.getElementById('dataSourceTitleField').value.trim()),
            timeField: escapeHtml(document.getElementById('dataSourceTimeField').value.trim()),
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
    } else {
        config.tasks.push(taskData);
    }

    saveConfig();
    renderTasks();
    closeTaskModal();

    // 自动上传到 GitHub
    await uploadConfigToGist();
}

async function deleteTask(taskId) {
    openConfirmModal('删除任务', '确定要删除这个任务吗？', async () => {
        config.tasks = config.tasks.filter(t => t.id !== taskId);
        saveConfig();
        renderTasks();
        
        // 自动上传到 GitHub
        await uploadConfigToGist();
        showToast('任务已删除', 'success');
    });
}

function triggerTask(taskId) {
    const task = config.tasks.find(t => t.id === taskId);
    if (!task) return;

    const channel = config.channels.find(c => c.id === task.channelId);
    if (!channel) {
        showToast('渠道不存在', 'error');
        return;
    }

    openConfirmModal('确认触发', `确定要手动触发任务 "${task.taskName}" 吗？`, () => {
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
    });
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

async function saveChannel() {
    const type = document.getElementById('channelType').value;
    const channelData = {
        id: editingChannelId || Date.now().toString(),
        name: escapeHtml(document.getElementById('channelName').value.trim()),
        type: type,
        enable: document.getElementById('channelEnabled').checked
    };

    if (type === 'wxtpl') {
        channelData.appId = escapeHtml(document.getElementById('channelAppId').value.trim());
        channelData.appSecret = escapeHtml(document.getElementById('channelAppSecret').value.trim());
        channelData.templateId = escapeHtml(document.getElementById('channelTemplateId').value.trim());
        channelData.openId = escapeHtml(document.getElementById('channelOpenId').value.trim());
        
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
        channelData.webhook = escapeHtml(document.getElementById('channelWebhook').value.trim());
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
    } else {
        config.channels.push(channelData);
    }

    saveConfig();
    renderChannels();
    closeChannelModal();

    // 自动上传到 GitHub
    await uploadConfigToGist();
}

async function deleteChannel(channelId) {
    if (config.tasks.some(t => t.channelId === channelId)) {
        showToast('该渠道正在被任务使用，无法删除', 'error');
        return;
    }

    openConfirmModal('删除渠道', '确定要删除这个渠道吗？', async () => {
        config.channels = config.channels.filter(c => c.id !== channelId);
        saveConfig();
        renderChannels();
        
        // 自动上传到 GitHub
        await uploadConfigToGist();
        showToast('渠道已删除', 'success');
    });
}

async function uploadConfigToGist() {
    const gistId = localStorage.getItem(STORAGE_KEY_GIST_ID);
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);

    if (!gistId || !token) {
        console.log('未配置 Gist 或 Token，跳过上传');
        return;
    }

    try {
        showToast('正在保存到 GitHub...', 'info');
        
        await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json'
            },
            body: JSON.stringify({
                files: {
                    'zxyalert-config.json': {
                        content: JSON.stringify(config, null, 2)
                    }
                }
            })
        });

        showToast('已保存到 GitHub', 'success');
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
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


function switchSection(sectionId) {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${sectionId}Section`).classList.add('active');
}



document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    updateConfigPreview();

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchSection(tab.dataset.section);
        });
    });

    document.getElementById('taskCron').addEventListener('input', updateCronPreview);
});