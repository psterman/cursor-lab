# -*- coding: utf-8 -*-
import codecs

# Decode the hex to get the actual quotes
left_quote = codecs.decode('e2809c', 'hex').decode('utf-8')
right_quote = codecs.decode('e2809d', 'hex').decode('utf-8')

print('Left quote:', repr(left_quote))
print('Right quote:', repr(right_quote))

with open('stats2.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Try to find the pattern with Chinese quotes
test_str = '避免无限' + left_quote + '处理中' + right_quote
print('Looking for:', repr(test_str))

if test_str in content:
    print('Found with Chinese quotes!')
else:
    print('Not found with Chinese quotes')
    # Try with regular quotes
    test_str2 = '避免无限"处理中"'
    if test_str2 in content:
        print('Found with regular quotes!')
    else:
        print('Not found with regular quotes either')
