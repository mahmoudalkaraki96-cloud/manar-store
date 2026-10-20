import os
import re

def product_scope():
    raw=os.environ.get('PRODUCT_IDS','').strip()
    if not raw:return ''
    parts=raw.split(',')
    if len(parts)>500 or any(not re.fullmatch(r'[1-9][0-9]*',p.strip()) for p in parts):
        raise ValueError('PRODUCT_IDS must be comma-separated positive product IDs')
    ids=sorted(set(int(p.strip()) for p in parts))
    return ' AND p.id IN ('+','.join(map(str,ids))+') '
