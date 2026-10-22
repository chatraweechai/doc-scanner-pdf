package io.github.chatrawichaitech.docscanner

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream

/**
 * เสิร์ฟหน้าเว็บของแอป (assets/www) ที่ https://appassets.androidplatform.net/ และปิดกั้นคำขออื่นทั้งหมด
 * แอปไม่มีสิทธิ์ใช้อินเทอร์เน็ต — ทุกไฟล์ที่หน้าเว็บใช้ต้องอยู่ในแอป
 * (ไม่ขึ้นกับคลาสของ Android เพื่อทดสอบด้วย JUnit ได้)
 */
class AssetRouter(private val openAsset: (String) -> InputStream) {

    class Response(
        val status: Int,
        val reason: String,
        val mimeType: String,
        val encoding: String?,
        val headers: Map<String, String>,
        val body: InputStream,
    )

    /** คำขอที่ WebView ต้องให้ AssetRouter ตอบ (ไม่ส่งออกไปยังเครือข่าย) */
    fun route(scheme: String?, host: String?, path: String?, method: String?): Response {
        if (!isAppUrl(scheme, host)) return error(403, "Forbidden")
        if (method != "GET" && method != "HEAD") return error(405, "Method Not Allowed")
        val rel = assetPath(path) ?: return error(404, "Not Found")
        val mime = MIME[extension(rel)] ?: return error(404, "Not Found")
        open(rel)?.let { stream ->
            val encoding = if (mime.startsWith("text/") || mime == "application/json") "utf-8" else null
            return Response(200, "OK", mime, encoding, HEADERS, stream)
        }
        // การ build ของ Android แตกไฟล์ .gz ใน assets และตัดนามสกุลออก (เช่น tha.traineddata.gz → tha.traineddata)
        // จึงเสิร์ฟไฟล์ที่แตกแล้วแทน — Tesseract.js ตรวจ magic bytes เองและรับได้ทั้งแบบ gzip และไม่ gzip
        if (rel.endsWith(".gz")) {
            open(rel.dropLast(3))?.let { return Response(200, "OK", "application/octet-stream", null, HEADERS, it) }
        }
        return error(404, "Not Found")
    }

    private fun open(rel: String): InputStream? = try {
        openAsset("$ROOT/$rel")
    } catch (e: IOException) {
        null
    }

    private fun error(status: Int, reason: String) =
        Response(status, reason, "text/plain", "utf-8", HEADERS, ByteArrayInputStream(ByteArray(0)))

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val ORIGIN = "https://$HOST"
        const val START_URL = "$ORIGIN/index.html"
        const val ROOT = "www"
        private const val MAX_PATH = 512

        /** ชนิดไฟล์ที่เสิร์ฟ — ต้องตรงกับ MIME ใน tools/convert/build.js */
        val MIME: Map<String, String> = mapOf(
            "html" to "text/html",
            "css" to "text/css",
            "js" to "text/javascript",
            "mjs" to "text/javascript",
            "json" to "application/json",
            "wasm" to "application/wasm",
            "ttf" to "font/ttf",
            "pfb" to "application/octet-stream",
            "gz" to "application/gzip",
            "txt" to "text/plain",
            "md" to "text/markdown",
        )

        private val HEADERS = mapOf(
            "X-Content-Type-Options" to "nosniff",
            "Cache-Control" to "no-cache",
            "Cross-Origin-Resource-Policy" to "same-origin",
        )

        fun isAppUrl(scheme: String?, host: String?): Boolean = scheme == "https" && host == HOST

        /** path ของ URL (ถอดรหัส %xx แล้ว) → path ใต้ www/ หรือ null ถ้าไม่ปลอดภัย/ไม่ถูกต้อง */
        fun assetPath(path: String?): String? {
            if (path == null) return null
            if (path == "" || path == "/") return "index.html"
            if (!path.startsWith("/") || path.length > MAX_PATH) return null
            val p = path.substring(1)
            if (p.any { it.code < 0x20 || it.code == 0x7f || it == '\\' }) return null
            if (p.split('/').any { it.isEmpty() || it == "." || it == ".." }) return null
            return p
        }

        fun extension(path: String): String =
            path.substringAfterLast('/').substringAfterLast('.', "").lowercase()
    }
}
