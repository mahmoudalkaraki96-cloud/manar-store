export const storeLanguages = ["ar", "he", "en"];
const allowedFields = {
  category: new Set(["name", "description"]),
  product: new Set(["name", "description", "specifications", "variantName"]),
  variant: new Set(["name"]),
};

function targetKey(kind, id, field, productId) {
  return JSON.stringify([kind, productId ?? null, id, field]);
}

function catalogTargets(catalog) {
  const targets = new Map();
  function add(kind, record, productId) {
    for (const field of allowedFields[kind]) {
      targets.set(targetKey(kind, record.id, field, productId), record[field]);
    }
  }
  for (const category of catalog.categories) {
    if (category.active) add("category", category);
  }
  for (const product of catalog.products) {
    if (!product.active) continue;
    add("product", product);
    for (const variant of product.variants ?? []) add("variant", variant, product.id);
  }
  return targets;
}

export function previewCatalogImport(catalog, rows) {
  const targets = catalogTargets(catalog);
  const seen = new Set();
  const accepted = [];
  const errors = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || !Object.hasOwn(allowedFields, row.kind) ||
        !allowedFields[row.kind].has(row.field) || !Number.isSafeInteger(row.id) || row.id <= 0 ||
        (row.kind === "variant" && (!Number.isSafeInteger(row.productId) || row.productId <= 0)) ||
        (row.kind !== "variant" && row.productId != null)) {
      errors.push({ line: index + 1, code: "invalid_target" });
      continue;
    }
    const key = targetKey(row.kind, row.id, row.field, row.productId);
    let code;
    if (seen.has(key)) code = "duplicate_target";
    else if (!targets.has(key)) code = "missing_or_inactive_target";
    else if (typeof row.ar !== "string" || row.ar !== targets.get(key)) code = "source_changed";
    else if (!["draft", "editorial_draft"].includes(row.status)) code = "unresolved_review";
    else if (["en", "he"].some(lang => typeof row[lang] !== "string" ||
      !row[lang].trim() || row[lang].length > 16000)) code = "invalid_translation";
    seen.add(key);
    if (code) {
      errors.push({ line: index + 1, code, key });
      continue;
    }
    accepted.push({ key, source: row.ar, en: row.en.trim(), he: row.he.trim(), status: row.status });
  }
  return { accepted, errors };
}

export function localizeCatalog(catalog, entries, language) {
  if (language !== "he" && language !== "en") return catalog;
  const translations = new Map(entries.map(entry => [entry.key, entry]));
  function localize(kind, record, productId) {
    const result = { ...record };
    for (const field of allowedFields[kind]) {
      const entry = translations.get(targetKey(kind, record.id, field, productId));
      if (entry?.source === record[field] && entry?.[language]) result[field] = entry[language];
    }
    return result;
  }
  const categories = catalog.categories.map(category => localize("category", category));
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));
  const originalCategories = new Map(catalog.categories.map(category => [category.id, category]));
  const products = catalog.products.map(product => {
    const result = localize("product", product);
    const category = originalCategories.get(product.categoryId);
    if (category) {
      const root = category.parentId == null ? category : originalCategories.get(category.parentId);
      result.category = categoryNames.get(root?.id) ?? product.category;
      if (category.parentId != null) result.subcategory = categoryNames.get(category.id) ?? product.subcategory;
    }
    if (product.variants) result.variants = product.variants.map(variant => localize("variant", variant, product.id));
    return result;
  });
  return { ...catalog, categories, products };
}
