"""Approve a reviewed image batch and publish only explicitly selected products. No AI calls."""
import argparse,json,time,uuid,re
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from dofesh_variant_audit import D1

def publish(db,batch_id,numbers):
    if not re.fullmatch(r'batch_[a-zA-Z0-9]+',batch_id) or not numbers or len(numbers)>100:
        raise ValueError('invalid_selection')
    marks=','.join('?' for _ in numbers)
    rows=db.query(f"""SELECT ai.batch_id,ai.media_id,ai.product_id,ai.item_number,ai.generated_url,ai.original_url,ai.status,
        p.active,p.price_agorot,p.stock_quantity,p.updated_at,p.deleted_at,m.url
        FROM image_ai_items ai JOIN products p ON p.id=ai.product_id
        JOIN product_media m ON m.id=ai.media_id AND m.product_id=p.id
        WHERE ai.batch_id=? AND ai.item_number IN ({marks}) ORDER BY ai.item_number""",[batch_id]+numbers)
    if len(rows)!=len(numbers) or {r['item_number'] for r in rows}!=set(numbers):
        raise ValueError('missing_or_ambiguous_batch_products')
    for r in rows:
        if r['status'] not in ('pending_review','published') or r['deleted_at'] is not None:
            raise ValueError('product_not_ready')
        if not re.fullmatch(r'/media/edited/batch-v2/product-\d+-media-\d+\.webp',r['generated_url'] or ''):
            raise ValueError('generated_image_not_verified')
        if r['url'] not in (r['original_url'],r['generated_url']):
            raise ValueError('image_changed_since_batch')
    now=int(time.time()*1000);token=uuid.uuid4().hex
    statements=[]
    for r in rows:
        detail=json.dumps({'operation':token,'batch_id':batch_id,'item_number':r['item_number'],'before_active':r['active'],
                           'before_image':r['url'],'after_image':r['generated_url'],'price_preserved':r['price_agorot'],
                           'stock_preserved':r['stock_quantity']})
        # CHECK constraint table existing in D1? Use audit INSERT plus guarded mutations and verify changes inside batch.
        # A deliberate NOT NULL violation in audit_logs aborts the whole batch if any snapshot guard fails.
        guard="""INSERT INTO audit_logs(entity_type,entity_id,action,details_json,created_at)
          SELECT 'product',?,CASE WHEN EXISTS(
            SELECT 1 FROM products p JOIN product_media m ON m.product_id=p.id
            JOIN image_ai_items ai ON ai.media_id=m.id AND ai.product_id=p.id
            WHERE p.id=? AND p.updated_at=? AND p.active=? AND p.price_agorot=? AND p.stock_quantity=?
              AND p.deleted_at IS NULL AND m.id=? AND m.url=? AND ai.batch_id=? AND ai.status=?
              AND ai.generated_url=? AND ai.item_number=?
          ) THEN 'approve_image_and_publish_product' ELSE NULL END,?,?"""
        statements.append((guard,[str(r['product_id']),r['product_id'],r['updated_at'],r['active'],r['price_agorot'],r['stock_quantity'],
                                  r['media_id'],r['url'],batch_id,r['status'],r['generated_url'],r['item_number'],detail,now]))
        statements.append(('UPDATE product_media SET url=?,updated_at=? WHERE id=? AND product_id=?',
                           [r['generated_url'],now,r['media_id'],r['product_id']]))
        statements.append(("UPDATE image_ai_items SET status='published',updated_at=? WHERE batch_id=? AND media_id=?",
                           [now,batch_id,r['media_id']]))
        statements.append(('UPDATE products SET active=1,updated_at=? WHERE id=?',[now,r['product_id']]))
    db.batch(statements)
    after=db.query(f'SELECT id,item_number,name,active,price_agorot,stock_quantity FROM products WHERE item_number IN ({marks}) ORDER BY item_number',numbers)
    if len(after)!=len(rows) or any(r['active']!=1 for r in after):raise RuntimeError('publish_verification_failed')
    return after

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--batch-id',required=True);ap.add_argument('--items',required=True);args=ap.parse_args()
    numbers=sorted(set(int(n) for n in args.items.split(',')))
    rows=publish(D1(),args.batch_id,numbers)
    folder=Path('docs/dofesh-draft-import');folder.mkdir(exist_ok=True,parents=True)
    result={'time':datetime.now(ZoneInfo('Asia/Hebron')).isoformat(),'batch_id':args.batch_id,'products':rows,'prices_and_stock_preserved':True}
    (folder/'published-products.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with Path('STORE-PROGRESS.md').open('a',encoding='utf-8') as f:
        f.write('\n\n### '+result['time']+' — DOFESH-IMAGE-APPROVE-PUBLISH\n')
        f.write('- أذن المستخدم باعتماد الصور ونشر منتجات الدفعة؛ اعتمدت الصور ونشرت المنتجات التالية بدون تغيير الأسعار أو المخزون:\n')
        for r in rows:f.write('- '+json.dumps(r,ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
