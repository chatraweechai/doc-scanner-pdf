package io.github.chatrawichaitech.docscanner

/**
 * เลขรุ่นของแอป (versionName จากหัวข้อบนสุดของ CHANGELOG.md เช่น 1.0.17) ส่งให้หน้าเว็บทาง user agent
 * — android/platform.js อ่าน " DocScannerPDF/1.0.17" แล้วแสดง "เวอร์ชัน v1.0.17 (Android)"
 */
object AppVersion {
    const val TOKEN = "DocScannerPDF"
    private val VERSION = Regex("""^\d{1,3}\.\d{1,3}\.\d{1,3}$""")
    private val EXISTING = Regex("""\s*\b$TOKEN/\S*""")

    /** user agent เดิม + " DocScannerPDF/<version>" (ไม่ซ้ำเมื่อเรียกซ้ำ; เลขรุ่นผิดรูปแบบ → ไม่เพิ่ม) */
    fun userAgent(base: String?, version: String?): String {
        val clean = EXISTING.replace(base.orEmpty(), "").trim()
        if (version == null || !VERSION.matches(version)) return clean
        return if (clean.isEmpty()) "$TOKEN/$version" else "$clean $TOKEN/$version"
    }
}
