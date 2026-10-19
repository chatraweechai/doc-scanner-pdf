package io.github.chatrawichaitech.docscanner

import org.junit.Assert.assertEquals
import org.junit.Test

class AppVersionTest {
    private val base = "Mozilla/5.0 (Linux; Android 16; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0 Mobile Safari/537.36"

    @Test
    fun appendsTheVersionToken() {
        assertEquals("$base DocScannerPDF/1.0.17", AppVersion.userAgent(base, "1.0.17"))
    }

    @Test
    fun replacesAnOldTokenInsteadOfAddingASecondOne() {
        val once = AppVersion.userAgent(base, "1.0.17")
        assertEquals("$base DocScannerPDF/1.0.18", AppVersion.userAgent(once, "1.0.18"))
    }

    @Test
    fun ignoresMalformedVersions() {
        listOf(null, "", "1.0", "1.0.17 (abc)", "1.0.17\" x", "1.0.1000", "v1.0.17").forEach {
            assertEquals("version \"$it\"", base, AppVersion.userAgent(base, it))
        }
    }

    @Test
    fun worksWithoutABaseUserAgent() {
        assertEquals("DocScannerPDF/1.0.17", AppVersion.userAgent(null, "1.0.17"))
    }
}
