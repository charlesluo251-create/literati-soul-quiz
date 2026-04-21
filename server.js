const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== 配置 ======
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'cl2026';
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// ====== 数据存储 ======
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  // 默认数据结构
  return {
    visits: 0,
    completes: 0,
    daily: {},
    results: {},
    recent: []
  };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ====== API 路由 ======

// 记录访问
app.post('/api/visit', (req, res) => {
  const data = loadData();
  data.visits++;
  
  const today = new Date().toISOString().slice(0, 10);
  data.daily[today] = (data.daily[today] || 0) + 1;
  
  // 简单去重：同一IP同一分钟内只算一次访问
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const minuteKey = `${ip}_${today}_${new Date().getHours()}_${Math.floor(new Date().getMinutes() / 5)}`;
  
  // 最近访问记录（最多保留200条）
  data.recent.unshift({
    time: new Date().toISOString(),
    type: 'visit',
    ip: ip
  });
  if (data.recent.length > 200) data.recent.length = 200;
  
  saveData(data);
  res.json({ ok: true, visits: data.visits });
});

// 记录测试完成
app.post('/api/complete', (req, res) => {
  const { result } = req.body;
  if (!result) return res.status(400).json({ error: 'missing result' });
  
  const data = loadData();
  data.completes++;
  
  if (!data.results) data.results = {};
  data.results[result] = (data.results[result] || 0) + 1;
  
  data.recent.unshift({
    time: new Date().toISOString(),
    type: 'complete',
    result: result
  });
  if (data.recent.length > 200) data.recent.length = 200;
  
  saveData(data);
  res.json({ ok: true, completes: data.completes });
});

// 获取统计数据（需要管理员密钥）
app.get('/api/stats', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  
  const data = loadData();
  const today = new Date().toISOString().slice(0, 10);
  
  res.json({
    visits: data.visits || 0,
    completes: data.completes || 0,
    today: (data.daily && data.daily[today]) || 0,
    results: data.results || {},
    recent: (data.recent || []).slice(0, 20),
    daily: data.daily || {}
  });
});

// 重置数据（需要管理员密钥）
app.post('/api/reset', (req, res) => {
  const key = req.body.key || req.query.key;
  if (key !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  
  saveData({
    visits: 0,
    completes: 0,
    daily: {},
    results: {},
    recent: []
  });
  res.json({ ok: true, message: '数据已重置' });
});

// ====== 首页 ======
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== 启动 ======
app.listen(PORT, () => {
  console.log(`Literati Quiz API server running on port ${PORT}`);
  // 确保数据文件存在
  if (!fs.existsSync(DATA_FILE)) {
    saveData({ visits: 0, completes: 0, daily: {}, results: {}, recent: [] });
    console.log('Created initial data.json');
  }
});
