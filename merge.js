import fs from 'fs';

// 读取文件
const cnSql = fs.readFileSync('seed.sql', 'utf8');
const enSql = fs.readFileSync('seed2.sql', 'utf8');

// 匹配 SQL 中 (id, 'dimension', level, 'content', 'note') 的正则
const valuesRegex = /\(\d+,\s*'([^']+)',\s*(\d+),\s*'((?:''|[^'])+)',\s*'((?:''|[^'])+)'\)/g;

function extractData(sql, lang, limit = 243) {
    const results = [];
    let match;
    while ((match = valuesRegex.exec(sql)) !== null && results.length < limit) {
        results.push({
            dimension: match[1],
            level: match[2],
            content: match[3],
            note: match[4],
            lang: lang
        });
    }
    return results;
}

// 提取数据（严格限制 243 条）
const cnData = extractData(cnSql, 'cn', 243);
const enData = extractData(enSql, 'en', 243);

// 构建新的 SQL
let newSql = `-- 合并后的种子文件 (中英严格对应 243 句)\nDELETE FROM answer_book;\nUPDATE sqlite_sequence SET seq = 0 WHERE name = 'answer_book';\n\nINSERT INTO answer_book (id, dimension, level, content, note, lang) VALUES\n`;

// 合并数据：ID 1-243 是中文，ID 244-486 是英文
const allData = [
    ...cnData.map((d, i) => ({ ...d, id: i + 1 })),
    ...enData.map((d, i) => ({ ...d, id: i + 244 }))
];

const valueLines = allData.map(item => {
    return `(${item.id}, '${item.dimension}', ${item.level}, '${item.content}', '${item.note}', '${item.lang}')`;
});

newSql += valueLines.join(',\n') + ';';

fs.writeFileSync('seed_merged.sql', newSql);

console.log('✅ 合并完成！');
console.log('📊 中文: ' + cnData.length + ' 句 (ID: 1-243)');
console.log('📊 英文: ' + enData.length + ' 句 (ID: 244-486)');