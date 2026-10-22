package io.github.chatrawichaitech.docscanner

/** ชื่อไฟล์ที่ได้จากหน้าเว็บ → ชื่อที่ปลอดภัยสำหรับบันทึก/แชร์ (หน้าเว็บตรวจแล้ว แต่ฝั่งแอปต้องไม่เชื่อ) */
object FileNames {
    const val MAX_LENGTH = 100

    const val DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    /** ชนิดไฟล์ที่หน้าเว็บส่งให้บันทึก/แชร์ได้ → นามสกุล (PDF, ข้อความ OCR, รูป/ZIP/Word จากการแปลงไฟล์ PDF) */
    val EXTENSIONS: Map<String, String> = mapOf(
        "application/pdf" to "pdf",
        "text/plain" to "txt",
        "image/jpeg" to "jpg",
        "application/zip" to "zip",
        DOCX to "docx",
    )

    /** ชื่อเมื่อชื่อไฟล์ว่าง */
    private val DEFAULT_BASE = mapOf("pdf" to "scan", "txt" to "text", "jpg" to "page", "zip" to "pages", "docx" to "document")

    private val FORBIDDEN = Regex("[\\\\/:*?\"<>|\\p{Cntrl}]")
    // อักขระที่มองไม่เห็นหรือกลับทิศข้อความ (ใช้ปลอมนามสกุลไฟล์ได้)
    private val INVISIBLE = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]")

    fun sanitize(name: String?, mime: String): String {
        val ext = EXTENSIONS[mime] ?: throw IllegalArgumentException("unsupported type: $mime")
        var base = (name ?: "").replace(INVISIBLE, "").replace(FORBIDDEN, "_").trim()
        if (base.lowercase().endsWith(".$ext")) base = base.dropLast(ext.length + 1)
        base = base.trim().trimStart('.').trimEnd('.', ' ')
        if (base.isEmpty()) base = DEFAULT_BASE[ext] ?: "file"
        val maxBase = MAX_LENGTH - ext.length - 1
        if (base.codePointCount(0, base.length) > maxBase) {
            base = base.substring(0, base.offsetByCodePoints(0, maxBase)).trimEnd('.', ' ')
        }
        return "$base.$ext"
    }
}
