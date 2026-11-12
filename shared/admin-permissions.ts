export const permissionLabels = {
 'dashboard.read':'عرض النظرة العامة والسلال', 'analytics.read':'عرض التحليلات',
 'orders.read':'عرض الطلبات', 'orders.write':'إنشاء وتعديل الطلبات', 'orders.delete':'حذف واستعادة الطلبات',
 'customers.read':'عرض الزبائن', 'customers.write':'إنشاء وربط الزبائن وتسجيل الدفعات', 'customers.password':'إنشاء حسابات الزبائن وضبط كلمات المرور',
 'products.read':'عرض الكتالوج والمخزون', 'products.write':'تعديل المنتجات والمتغيرات والمخزون',
 'categories.write':'تعديل الأقسام', 'content.write':'تعديل المحتوى والهايلايتس والسياسات',
 'suppliers.write':'الموردون والمشتريات والاستيراد', 'shipping.write':'إدارة الشحن', 'settings.write':'إعدادات المتجر',
 'notifications.write':'إرسال إشعارات الزبائن', 'users.manage':'إدارة مستخدمي اللوحة', 'groups.manage':'إدارة مجموعات الصلاحيات', 'audit.read':'عرض سجل الحركات'
} as const;
export type Permission = keyof typeof permissionLabels;
export const permissions = Object.keys(permissionLabels) as Permission[];
export const defaultGroups:Record<string,Permission[]> = {
 'المحررون':['products.read','products.write','categories.write','content.write'],
 'المشرفون':['dashboard.read','analytics.read','orders.read','orders.write','customers.read','customers.write','products.read','products.write','categories.write','content.write','shipping.write'],
};
export function validPermissions(value:unknown):Permission[]{
 if(!Array.isArray(value)||value.some(p=>typeof p!=='string'||!permissions.includes(p as Permission)))throw new Error('صلاحية غير صحيحة');
 return [...new Set(value)] as Permission[];
}
export const modulePermission:Record<string,Permission>={
 'نظرة عامة':'dashboard.read','التحليلات':'analytics.read','الطلبات':'orders.read','الزبائن':'customers.read',
 'المنتجات':'products.read','الأقسام':'products.read','المتغيرات والمخزون':'products.read','الهايلايتس':'content.write',
 'استيراد الأصناف':'suppliers.write','المشتريات والموردون':'suppliers.write','الشحن والمناطق':'shipping.write',
 'مراجعات المنتجات':'content.write','العروض والمحتوى':'content.write','سياسات المتجر':'content.write','الإعدادات':'settings.write','الخصومات وأكواد الخصم':'settings.write',
 'المستخدمون والصلاحيات':'users.manage','مجموعات الصلاحيات':'groups.manage','سجل الحركات':'audit.read'
};
