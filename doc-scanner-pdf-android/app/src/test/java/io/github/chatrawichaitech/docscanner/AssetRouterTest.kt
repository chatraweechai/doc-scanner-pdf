package io.github.chatrawichaitech.docscanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException

class AssetRouterTest {
    private companion object {
        val MISSING = setOf("www/missing.js", "www/vendor/tesseract/lang/eng.traineddata.gz", "www/nothere.gz", "www/nothere")
    }

    private val opened = mutableListOf<String>()
    private val router = AssetRouter { path ->
        opened += path
        if (path in MISSING) throw FileNotFoundException(path)
        ByteArrayInputStream(path.toByteArray())
    }

    private fun get(path: String?, scheme: String = "https", host: String = AssetRouter.HOST, method: String = "GET") =
        router.route(scheme, host, path, method)

    @Test
    fun servesAppFilesWithCorrectTypes() {
        val cases = mapOf(
            "/" to "text/html",
            "/index.html" to "text/html",
            "/css/style.css" to "text/css",
            "/js/app.js" to "text/javascript",
            "/vendor/opencv/simd/opencv_js.wasm" to "application/wasm",
            "/vendor/tesseract/lang/tha.traineddata.gz" to "application/gzip",
            "/vendor/fonts/Sarabun-Regular.ttf" to "font/ttf",
        )
        for ((path, mime) in cases) {
            val r = get(path)
            assertEquals(path, 200, r.status)
            assertEquals(path, mime, r.mimeType)
            assertEquals("nosniff", r.headers["X-Content-Type-Options"])
        }
        assertEquals("www/index.html", opened.first())
        assertEquals("utf-8", get("/js/app.js").encoding)
        assertNull(get("/vendor/opencv/simd/opencv_js.wasm").encoding)
    }

    @Test
    fun gzAssetsFallBackToTheFileTheBuildUnpacked() {
        // AGP stores assets/x.gz decompressed as assets/x
        val r = get("/vendor/tesseract/lang/eng.traineddata.gz")
        assertEquals(200, r.status)
        assertEquals("application/octet-stream", r.mimeType)
        assertEquals("www/vendor/tesseract/lang/eng.traineddata", String(r.body.readBytes()))
        assertEquals(404, get("/nothere.gz").status) // neither x.gz nor x
    }

    @Test
    fun blocksEverythingOutsideTheApp() {
        assertEquals(403, get("/index.html", host = "example.com").status)
        assertEquals(403, get("/index.html", scheme = "http").status)
        assertEquals(403, get("/index.html", host = "appassets.androidplatform.net.evil.com").status)
        assertEquals(403, router.route(null, null, "/", "GET").status)
        assertEquals(405, get("/index.html", method = "POST").status)
    }

    @Test
    fun rejectsTraversalAndOddPaths() {
        for (p in listOf("/../secret", "/js/../../x.js", "/./index.html", "//index.html", "/js//app.js", "/js\\app.js",
            "/a\u0000.js", "js/app.js", "/" + "a".repeat(600) + ".js")) {
            assertEquals(p, 404, get(p).status)
        }
        assertNull(AssetRouter.assetPath(".."))
        assertEquals(404, get("/SHA256SUMS").status)          // ชนิดไฟล์ที่ไม่เสิร์ฟ
        assertEquals(404, get("/vendor/tesseract/LICENSE").status)
        assertEquals(404, get("/missing.js").status)           // ไม่มีไฟล์
        assertEquals(false, opened.any { it.contains("..") })
    }
}
