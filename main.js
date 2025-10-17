// 就业竞争力测评系统 - 主要JavaScript逻辑

class AssessmentSystem {
    constructor() {
        this.questions = [];
        this.answers = {};
        this.currentQuestionIndex = 0;
        this.userInfo = {};
        this.results = {};
        this.suggestions = {};
        
        this.init();
    }
    
    async init() {
        try {
            // 加载题目数据
            const questionsResponse = await fetch('questions.json');
            this.questions = await questionsResponse.json();
            
            // 加载建议数据
            const suggestionsResponse = await fetch('suggestions.json');
            this.suggestions = await suggestionsResponse.json();
            
            // 检查用户状态
            this.checkUserStatus();
            
        } catch (error) {
            console.error('系统初始化失败:', error);
            this.showError('系统初始化失败，请刷新页面重试');
        }
    }
    
    // 检查用户状态
    checkUserStatus() {
        this.userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        this.results = JSON.parse(localStorage.getItem('assessmentResults') || '{}');
        
        // 根据当前页面和用户状态进行相应处理
        const currentPage = window.location.pathname.split('/').pop();
        
        switch (currentPage) {
            case 'index.html':
            case '':
                // 首页 - 检查是否已登录
                if (this.userInfo.username) {
                    // 如果已有用户信息，可以直接跳转到测评页面
                    // window.location.href = 'assessment.html';
                }
                break;
                
            case 'assessment.html':
                // 测评页面 - 必须登录
                if (!this.userInfo.username) {
                    window.location.href = 'index.html';
                }
                break;
                
            case 'results.html':
                // 结果页面 - 必须有测评结果
                if (!this.results.totalScore) {
                    window.location.href = 'index.html';
                }
                break;
        }
    }
    
    // 验证用户信息
    validateUserInfo(username, grade, phone) {
        const errors = [];
        
        // 验证姓名
        if (!username || username.trim().length < 1) {
            errors.push('请输入有效的姓名');
        }
        
        // 验证年级
        const validGrades = ['大一', '大二', '大三', '大四', '研一', '研二', '研三', '博一', '博二', '博三', '博四'];
        if (!validGrades.includes(grade)) {
            errors.push('请选择有效的年级');
        }
        
        // 验证手机号
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            errors.push('请输入有效的11位手机号');
        }
        
        return errors;
    }
    
    // 保存用户信息
    async saveUserInfo(userInfo) {
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...userInfo,
                    timestamp: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                localStorage.setItem('userInfo', JSON.stringify(userInfo));
                return { success: true };
            } else {
                const error = await response.json();
                return { success: false, error: error.error };
            }
        } catch (error) {
            console.error('保存用户信息失败:', error);
            return { success: false, error: '网络错误' };
        }
    }
    
    // 计算测评分数
    calculateScores(answers) {
        const moduleScores = {
            '创造力': { score: 0, maxScore: 0 },
            '技术能力': { score: 0, maxScore: 0 },
            '任务理解与执行': { score: 0, maxScore: 0 },
            '社交与应变': { score: 0, maxScore: 0 },
            '问题拆解与分析': { score: 0, maxScore: 0 }
        };
        
        // 计算各模块得分
        this.questions.forEach((question, index) => {
            const selectedOption = question.options[answers[index]];
            const weight = question.weight;
            
            Object.entries(selectedOption.scores).forEach(([module, score]) => {
                if (moduleScores[module]) {
                    moduleScores[module].score += score * weight;
                    moduleScores[module].maxScore += weight;
                }
            });
        });
        
        // 计算标准化分数（5分制）
        const normalizedScores = {};
        Object.entries(moduleScores).forEach(([module, data]) => {
            normalizedScores[module] = (data.score / data.maxScore) * 5;
        });
        
        // 计算总分（100分制）
        const weights = {
            '创造力': 0.20,
            '技术能力': 0.25,
            '任务理解与执行': 0.20,
            '社交与应变': 0.15,
            '问题拆解与分析': 0.20
        };
        
        let totalScore = 0;
        Object.entries(normalizedScores).forEach(([module, score]) => {
            totalScore += (score / 5) * 100 * weights[module];
        });
        
        return {
            moduleScores: normalizedScores,
            totalScore: Math.round(totalScore),
            answers: answers
        };
    }
    
    // 获取分数等级
    getScoreLevel(score, maxScore = 5) {
        const percentage = (score / maxScore) * 100;
        if (percentage >= 80) return '专家';
        if (percentage >= 60) return '高级';
        if (percentage >= 40) return '中级';
        if (percentage >= 20) return '入门';
        return '初级';
    }
    
    // 获取分数范围
    getScoreRange(score, maxScore = 5) {
        const ranges = maxScore === 100 ? 
            ['0-20', '21-40', '41-60', '61-80', '81-100'] :
            ['0-1', '1-2', '2-3', '3-4', '4-5'];
        
        const percentage = (score / maxScore) * 100;
        const rangeIndex = Math.min(Math.floor(percentage / 20), 4);
        return ranges[rangeIndex];
    }
    
    // 获取个性化建议
    getPersonalizedSuggestions(results) {
        const suggestions = {
            total: null,
            modules: {}
        };
        
        // 总分建议
        const totalScoreRange = this.getScoreRange(results.totalScore, 100);
        suggestions.total = this.suggestions.totalScore?.[totalScoreRange];
        
        // 各模块建议
        Object.entries(results.moduleScores).forEach(([module, score]) => {
            const scoreRange = this.getScoreRange(score, 5);
            suggestions.modules[module] = this.suggestions.modules?.[module]?.[scoreRange];
        });
        
        return suggestions;
    }
    
    // 保存测评结果
    async saveAssessmentResults(results) {
        try {
            const response = await fetch('/api/assessments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userInfo: this.userInfo,
                    answers: results.answers,
                    results: results,
                    timestamp: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                localStorage.setItem('assessmentResults', JSON.stringify(results));
                return { success: true };
            } else {
                const error = await response.json();
                return { success: false, error: error.error };
            }
        } catch (error) {
            console.error('保存测评结果失败:', error);
            return { success: false, error: '网络错误' };
        }
    }
    
    // 清除所有数据
    clearAllData() {
        localStorage.removeItem('userInfo');
        localStorage.removeItem('assessmentResults');
        this.userInfo = {};
        this.results = {};
        this.answers = {};
        this.currentQuestionIndex = 0;
    }
    
    // 显示错误信息
    showError(message) {
        // 创建错误提示元素
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        errorDiv.textContent = message;
        
        document.body.appendChild(errorDiv);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 3000);
    }
    
    // 显示成功信息
    showSuccess(message) {
        // 创建成功提示元素
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successDiv.textContent = message;
        
        document.body.appendChild(successDiv);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }
    
    // 导出测评数据
    exportAssessmentData() {
        if (!this.results.totalScore) {
            this.showError('没有可导出的测评数据');
            return;
        }
        
        const data = {
            userInfo: this.userInfo,
            results: this.results,
            suggestions: this.getPersonalizedSuggestions(this.results),
            exportTime: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `assessment_result_${this.userInfo.username}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        this.showSuccess('测评数据导出成功！');
    }
    
    // 获取测评统计信息
    getStats() {
        return {
            totalQuestions: this.questions.length,
            answeredQuestions: Object.keys(this.answers).length,
            completionRate: (Object.keys(this.answers).length / this.questions.length * 100).toFixed(1),
            currentModule: this.questions[this.currentQuestionIndex]?.module || '-',
            userInfo: this.userInfo,
            results: this.results
        };
    }
}

// 全局工具函数

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 生成随机ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 深拷贝对象
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

// 验证邮箱格式
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// 验证手机号格式
function validatePhone(phone) {
    const re = /^1[3-9]\d{9}$/;
    return re.test(phone);
}

// 本地存储工具
const StorageUtil = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('LocalStorage set error:', e);
            return false;
        }
    },
    
    get: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('LocalStorage get error:', e);
            return defaultValue;
        }
    },
    
    remove: (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('LocalStorage remove error:', e);
            return false;
        }
    },
    
    clear: () => {
        try {
            localStorage.clear();
            return true;
        } catch (e) {
            console.error('LocalStorage clear error:', e);
            return false;
        }
    }
};

// 初始化全局测评系统实例
window.assessmentSystem = new AssessmentSystem();

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 添加全局错误处理
    window.addEventListener('error', function(e) {
        console.error('全局错误:', e.error);
    });
    
    // 添加未处理的Promise错误处理
    window.addEventListener('unhandledrejection', function(e) {
        console.error('未处理的Promise错误:', e.reason);
        e.preventDefault();
    });
    
    console.log('就业竞争力测评系统已初始化');
});

// 导出到全局作用域
window.AssessmentSystem = AssessmentSystem;
window.StorageUtil = StorageUtil;
window.formatDate = formatDate;
window.debounce = debounce;
window.throttle = throttle;
window.generateId = generateId;
window.deepClone = deepClone;
window.validateEmail = validateEmail;
window.validatePhone = validatePhone;