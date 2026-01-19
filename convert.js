import fs from 'fs';

// 读取 JSON 文件
const data = JSON.parse(fs.readFileSync('all_answers.json', 'utf8'));

let sql = `-- 自动生成的种子文件\nDELETE FROM answer_book;\nUPDATE sqlite_sequence SET seq = 0 WHERE name = 'answer_book';\n\n`;

sql += `INSERT INTO answer_book (id, dimension, level, content, note) VALUES \n`;

const values = data.map(item => {
  // 处理 SQL 字符串转义（如单引号）
  const cleanContent = item.content.replace(/'/g, "''");
  const cleanNote = item.note.replace(/'/g, "''");
  return `(${item.id}, '${item.dim}', ${item.lv}, '${cleanContent}', '${cleanNote}')`;
});

sql += values.join(',\n') + ';';

// 写入 SQL 文件
fs.writeFileSync('seed.sql', sql);
console.log('✅ 已成功生成 seed.sql，包含 243 条数据！');