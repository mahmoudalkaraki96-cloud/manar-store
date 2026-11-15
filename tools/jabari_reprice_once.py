"""One-time Jabari repricing, using verified original supplier prices."""
import json
import time
from pathlib import Path
from collections import Counter, defaultdict
from jabari_variant_audit import D1, fetch_product, parse_product, norm, SupplierMissing

def price(cost):
    return ((11 * cost + 999) // 1000) * 100

def plan(local, source):
    remote = {norm(v['name']): v['price'] for v in source['variants']}
    variants = local['variants']
    if not variants and not remote:
        return price(source['simple_price']), []
    keys = [norm(v['name'] or '') for v in variants]
    if not remote or not all(keys) or len(keys) != len(set(keys)) or set(keys) != set(remote) or len(remote) != len(source['variants']):
        raise ValueError('variant_mapping_requires_review')
    return min(map(price, remote.values())), [(v, price(remote[k])) for v,k in zip(variants,keys)]

def main():
    db=D1()
    db.query("CREATE TABLE IF NOT EXISTS jabari_reprice_v1(product_id INTEGER PRIMARY KEY,source_id INTEGER NOT NULL,detail TEXT NOT NULL)")
    rows=db.query("""SELECT p.id,ps.source_product_id AS sid FROM product_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id JOIN products p ON p.id=ps.product_id WHERE s.supplier_number=9102 AND p.deleted_at IS NULL
    UNION SELECT p.id,substr(k.keyword,8) FROM product_keywords k JOIN products p ON p.id=k.product_id WHERE k.keyword GLOB 'jabari-[0-9]*' AND p.deleted_at IS NULL
    UNION SELECT id,substr(slug,17) FROM products WHERE slug GLOB 'supplier-jabari-[0-9]*' AND deleted_at IS NULL""")
    sources=defaultdict(set)
    for row in rows:
        if str(row['sid']).isdigit():sources[row['id']].add(int(row['sid']))
    reverse=Counter(sid for ids in sources.values() for sid in ids)
    done={x['product_id'] for x in db.query('SELECT product_id FROM jabari_reprice_v1')}
    from jabari_variant_audit import snapshot
    folder=Path('jabari-reprice-report');folder.mkdir(exist_ok=True)
    results=[];last=0;state='interrupted'
    def report():
        (folder/'result.json').write_text(json.dumps(dict(status=state,counts=Counter(r['status'] for r in results),results=results),ensure_ascii=False,indent=2))
    try:
        if not sources:raise RuntimeError('no_jabari_mappings')
        for pid, ids in sorted(sources.items(),reverse=True):
            if pid in done:continue
            if len(ids)!=1 or reverse[next(iter(ids))]!=1:
                results.append(dict(product_id=pid,status='ambiguous_source'));continue
            sid=next(iter(ids))
            try:
                time.sleep(max(0,5-(time.monotonic()-last)));last=time.monotonic()
                source=parse_product(fetch_product(sid),sid)
                local=snapshot(db,pid)
                new, variants=plan(local,source)
            except (ValueError,SupplierMissing) as error:
                results.append(dict(product_id=pid,source_id=sid,status='review',reason=str(error)[:100]));report();continue
            if local['deleted_at'] is not None:continue
            detail=dict(product_id=pid,source_id=sid,old=local['price_agorot'],new=new,variants=[dict(id=v['id'],old=v['price_agorot'],new=n) for v,n in variants])
            payload=json.dumps(detail,ensure_ascii=False)
            valid="EXISTS(SELECT 1 FROM products WHERE id=? AND updated_at=? AND price_agorot IS ? AND deleted_at IS NULL) AND (SELECT COUNT(*) FROM product_variants WHERE product_id=?)=?"
            params=[pid,local['updated_at'],local['price_agorot'],pid,len(variants)]
            valid+=" AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM product_variants v WHERE v.id=json_extract(j.value,'$.id') AND v.product_id=? AND v.price_agorot IS json_extract(j.value,'$.old')))"
            params.extend([json.dumps(detail['variants']),pid])
            stmts=[("INSERT OR IGNORE INTO jabari_reprice_v1(product_id,source_id,detail) SELECT ?,?,? WHERE "+valid,[pid,sid,payload,*params])]
            gate=" AND EXISTS(SELECT 1 FROM jabari_reprice_v1 WHERE product_id=? AND detail=?)"
            # A new nonce distinguishes this write from a previous invocation.
            import uuid
            payload=json.dumps(dict(detail,nonce=uuid.uuid4().hex),ensure_ascii=False)
            stmts[0][1][2]=payload
            now=int(time.time()*1000)
            stmts.append(("UPDATE products SET price_agorot=?,updated_at=? WHERE id=?"+gate,[new,now,pid,pid,payload]))
            for v,n in variants:
                stmts.append(("UPDATE product_variants SET price_agorot=?,updated_at=? WHERE id=? AND product_id=?"+gate,[n,now,v['id'],pid,pid,payload]))
            result=db.batch(stmts)
            results.append(dict(detail,status='applied' if result[0]['meta']['changes']==1 else 'conflict'));report()
        state='completed_with_review' if any(r['status']!='applied' for r in results) else 'completed'
    finally:
        report()

if __name__=='__main__':main()
