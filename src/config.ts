/**
 * إعدادات الموقع الأساسية. عدّل هون بس.
 * whatsapp: رقمك الدولي بدون + وبدون مسافات، مثال: '963912345678'
 * إذا تركته فاضي، أزرار «ابدأ مشروعك» بتفتح الإيميل.
 */
export const site = {
  name: 'Tayf 3D',
  url: 'https://tayf3d.com',
  email: 'hello@tayf3d.com',
  whatsapp: '',
  instagram: 'https://www.instagram.com/tayf_3d_web/',
  message: 'مرحبا طيف، بدي احكي معكم عن موقع لمشروعي',
};

export function contactHref() {
  if (site.whatsapp) return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(site.message)}`;
  return `mailto:${site.email}?subject=${encodeURIComponent('مشروع موقع جديد')}&body=${encodeURIComponent(site.message)}`;
}
