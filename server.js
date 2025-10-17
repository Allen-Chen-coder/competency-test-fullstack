const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 数据库初始化
const db = new sqlite3.Database('assessment.db');

// 创建表
db.serialize(() => {
    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        grade TEXT NOT NULL,
        phone TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 测评结果表
    db.run(`CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        total_score INTEGER,
        module_scores TEXT,
        answers TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
});

// API路由

// 添加用户
app.post('/api/users', (req, res) => {
    const { username, grade, phone, timestamp } = req.body;
    
    // 验证输入
    if (!username || !grade || !phone) {
        return res.status(400).json({ error: '请填写完整信息' });
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: '手机号格式不正确' });
    }
    
    // 验证年级
    const validGrades = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博一', '博二', '博三', '博四'];
    if (!validGrades.includes(grade)) {
        return res.status(400).json({ error: '年级格式不正确' });
    }
    
    // 检查手机号是否已存在
    db.get('SELECT id FROM users WHERE phone = ?', [phone], (err, row) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        
        if (row) {
            return res.status(400).json({ error: '该手机号已参与测评' });
        }
        
        // 插入用户数据
        db.run('INSERT INTO users (username, grade, phone, timestamp) VALUES (?, ?, ?, ?)', 
            [username, grade, phone, timestamp || new Date().toISOString()], 
            function(err) {
                if (err) {
                    return res.status(500).json({ error: '用户数据保存失败' });
                }
                res.json({ id: this.lastID, message: '用户信息保存成功' });
            }
        );
    });
});

// 添加测评结果
app.post('/api/assessments', (req, res) => {
    const { userInfo, answers, results, timestamp } = req.body;
    
    if (!userInfo || !results) {
        return res.status(400).json({ error: '数据不完整' });
    }
    
    // 先查找用户ID
    db.get('SELECT id FROM users WHERE phone = ?', [userInfo.phone], (err, row) => {
        if (err) {
            return res.status(500).json({ error: '数据库查询错误' });
        }
        
        if (!row) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const userId = row.id;
        
        // 插入测评结果
        db.run('INSERT INTO assessments (user_id, total_score, module_scores, answers, timestamp) VALUES (?, ?, ?, ?, ?)', 
            [
                userId, 
                results.totalScore, 
                JSON.stringify(results.moduleScores), 
                JSON.stringify(answers),
                timestamp || new Date().toISOString()
            ], 
            function(err) {
                if (err) {
                    return res.status(500).json({ error: '测评结果保存失败' });
                }
                res.json({ id: this.lastID, message: '测评结果保存成功' });
            }
        );
    });
});

// 获取所有用户数据（管理后台用）
app.get('/api/admin/users', (req, res) => {
    const query = `
        SELECT u.*, a.total_score, a.module_scores, a.timestamp as assessment_time
        FROM users u
        LEFT JOIN assessments a ON u.id = a.user_id
        ORDER BY u.timestamp DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: '数据查询失败' });
        }
        
        // 处理数据格式
        const users = rows.map(row => ({
            id: row.id,
            username: row.username,
            grade: row.grade,
            phone: row.phone,
            totalScore: row.total_score,
            moduleScores: row.module_scores ? JSON.parse(row.module_scores) : null,
            userTime: row.timestamp,
            assessmentTime: row.assessment_time
        }));
        
        res.json(users);
    });
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
    const stats = {};
    
    // 用户统计
    db.get('SELECT COUNT(*) as totalUsers FROM users', (err, row) => {
        if (err) return res.status(500).json({ error: '统计查询失败' });
        stats.totalUsers = row.totalUsers;
        
        // 测评统计
        db.get('SELECT COUNT(*) as totalAssessments FROM assessments', (err, row) => {
            if (err) return res.status(500).json({ error: '统计查询失败' });
            stats.totalAssessments = row.totalAssessments;
            
            // 平均分统计
            db.get('SELECT AVG(total_score) as averageScore FROM assessments', (err, row) => {
                if (err) return res.status(500).json({ error: '统计查询失败' });
                stats.averageScore = Math.round(row.averageScore || 0);
                
                res.json(stats);
            });
        });
    });
});

// 删除用户数据
app.delete('/api/admin/users/:id', (req, res) => {
    const userId = req.params.id;
    
    db.run('DELETE FROM assessments WHERE user_id = ?', [userId], function(err) {
        if (err) {
            return res.status(500).json({ error: '删除测评数据失败' });
        }
        
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
            if (err) {
                return res.status(500).json({ error: '删除用户数据失败' });
            }
            
            res.json({ message: '用户数据删除成功' });
        });
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('数据库关闭失败:', err);
        } else {
            console.log('数据库连接已关闭');
        }
        process.exit(0);
    });
});