import json
import os

# 读取英文库
with open('src/roastLibrary2.json', 'r', encoding='utf-8') as f:
    en_library = json.load(f)

# 读取中文库
with open('src/roastLibrary.json', 'r', encoding='utf-8') as f:
    zh_library = json.load(f)

# 生成所有可能的索引 (00000 到 22222)
all_possible = []
for l in range(3):
    for p in range(3):
        for d in range(3):
            for e in range(3):
                for f in range(3):
                    index = f"{l}{p}{d}{e}{f}"
                    all_possible.append(index)

print(f"理论上应该有 {len(all_possible)} 种组合 (3^5 = 243)")
print(f"中文库实际有: {len(zh_library)} 个")
print(f"英文库实际有: {len(en_library)} 个")

# 找出英文库中缺失的索引
missing_in_en = []
for index in all_possible:
    if index not in en_library:
        missing_in_en.append(index)

print(f"\n英文库缺失的索引数量: {len(missing_in_en)}")
print(f"\n所有缺失的索引列表:")
for i, idx in enumerate(missing_in_en):
    print(f"  {idx}", end="  ")
    if (i + 1) % 10 == 0:
        print()

print(f"\n\n缺失索引的完整列表（用于添加到 roastLibrary2.json）:")
print("=" * 60)
for idx in missing_in_en:
    zh_text = zh_library.get(idx, "【中文库中也没有】")
    print(f'  "{idx}": "{zh_text}",')
