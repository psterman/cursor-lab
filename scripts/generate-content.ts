/**
 * 生成文案库 TypeScript 文件
 * 将 JSON 文件转换为 TypeScript 常量，供 Worker 使用
 */

import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.join(process.cwd(), 'src');
const workerDir = path.join(process.cwd(), 'src/worker');

// 读取 JSON 文件
const roastLibraryZh = JSON.parse(
  fs.readFileSync(path.join(srcDir, 'roastLibrary.json'), 'utf-8')
);
const roastLibraryEn = JSON.parse(
  fs.readFileSync(path.join(srcDir, 'roastLibrary2.json'), 'utf-8')
);
const personalityNamesZh = JSON.parse(
  fs.readFileSync(path.join(srcDir, 'personalityNames.json'), 'utf-8')
);
const personalityNamesEn = JSON.parse(
  fs.readFileSync(path.join(srcDir, 'personalityNamesEn.json'), 'utf-8')
);

// 生成 TypeScript 文件内容
const content = `/**
 * content-data.ts - 文案库数据（自动生成）
 * 此文件由 scripts/generate-content.ts 自动生成，请勿手动编辑
 * 生成时间: ${new Date().toISOString()}
 */

export const ROAST_LIBRARY_ZH: Record<string, string> = ${JSON.stringify(roastLibraryZh, null, 2)};

export const ROAST_LIBRARY_EN: Record<string, string> = ${JSON.stringify(roastLibraryEn, null, 2)};

export const PERSONALITY_NAMES_ZH: Record<string, string> = ${JSON.stringify(personalityNamesZh, null, 2)};

export const PERSONALITY_NAMES_EN: Record<string, string> = ${JSON.stringify(personalityNamesEn, null, 2)};
`;

// 写入文件
fs.writeFileSync(path.join(workerDir, 'content-data.ts'), content, 'utf-8');

console.log('✅ 文案库 TypeScript 文件生成成功: src/worker/content-data.ts');
