
- 2026-11-10 MOBILE-ALL-PRODUCTS clarification: owner explicitly wants «عرض كل المنتجات» inside the phone drawer only, not the horizontal phone category bar. Added a dedicated class on that bar entry and max720px scoped display:none; desktop entry/rail, drawer and all-products route remain unchanged. Included in unpublished candidate1.7.5. Variant gallery mixing reported separately; code analysis finds synthetic variant fallback included as a general photo. No gallery changes authorized/performed in this patch.

- Final1.7.5 code68a4bddadcaaada7370d8d6647b7d5efe4d1bb44 passed unified42775604826,storefront42775605006,publisher42775604855; six local floating preference/threshold/reset tests passed. No physical iPhone drag test or production publication performed. Ready for merge and owner prepare-release1.7.5. Gallery report was explained from code but remains unchanged.


## 2026-11-10 (Asia/Hebron) — VARIANT-GALLERY / candidate1.7.6
- User authorized inspecting/fixing variant galleries. Confirmed readCatalog/saveProduct scope variant media by variant_id; catalog image may fall back to the first active variant for cards while images contains only true general photos. Detail gallery incorrectly merged selected variant images with that display fallback, so pink->blue introduced pink into blue while dedup concealed it on pink.
- app/product-gallery.ts selects only chosen variant media when present, preserving multiple-image order/dedup. Variants lacking photos fall back only to real general product.images; explicit empty general images do not borrow another variant's synthetic card photo. Legacy image-only data remains supported. Card fallback remains unchanged; no stored media or variant associations edited.
- Candidate1.7.6. Five targeted regression tests prepared, CI pending. No real catalog changes/publication; owner prepares/publishes. Next: tests/build and source merge.
