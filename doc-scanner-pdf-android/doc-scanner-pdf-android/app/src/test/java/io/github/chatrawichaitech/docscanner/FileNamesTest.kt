package io.github.chatrawichaitech.docscanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FileNamesTest {
    @Test
    fun keepsGoodNames() {
        assertEquals("scan-20260927-1520.pdf", FileNames.sanitize("scan-20260927-1520.pdf", "application/pdf"))
        assertEquals("เอกสาร ประชุม.pdf", FileNames.sanitize("เอกสาร ประชุม.pdf", "application/pdf"))
        assertEquals("ข้อความ.txt", FileNames.sanitize("ข้อความ.txt", "text/plain"))
    }

    @Test
    fun forcesExtensionOfTheType() {
        assertEquals("report.pdf", FileNames.sanitize("report", "application/pdf"))
        assertEquals("evil.html.txt", FileNames.sanitize("evil.html", "text/plain"))
        assertEquals("a.PDF.txt", FileNames.sanitize("a.PDF", "text/plain"))
        assertEquals("x.pdf", FileNames.sanitize("x.PDF", "application/pdf"))
    }

    @Test
    fun removesPathsControlAndSpoofingCharacters() {
        assertEquals(".._.._etc_passwd.pdf".trimStart('.'), FileNames.sanitize("../../etc/passwd", "application/pdf"))
        assertEquals("a_b_c.pdf", FileNames.sanitize("a\\b/c", "application/pdf"))
        assertEquals("a_b.pdf", FileNames.sanitize("a\u0000b", "application/pdf"))
        assertEquals("invoicefdp.exe.pdf", FileNames.sanitize("invoice‮fdp.exe", "application/pdf"))
        assertEquals("scan.pdf", FileNames.sanitize("   ", "application/pdf"))
        assertEquals("scan.pdf", FileNames.sanitize(null, "application/pdf"))
        assertEquals("text.txt", FileNames.sanitize("...", "text/plain"))
        assertEquals("hidden.pdf", FileNames.sanitize(".hidden", "application/pdf"))
    }

    @Test
    fun limitsLength() {
        val long = FileNames.sanitize("ก".repeat(500), "application/pdf")
        assertTrue(long.endsWith(".pdf"))
        assertEquals(FileNames.MAX_LENGTH, long.codePointCount(0, long.length))
        val emoji = FileNames.sanitize("😀".repeat(200), "text/plain")
        assertEquals(FileNames.MAX_LENGTH, emoji.codePointCount(0, emoji.length))
        assertTrue(!emoji.dropLast(4).last().isHighSurrogate())
    }

    @Test
    fun convertedPdfOutputs() {
        assertEquals("รายงาน-2.jpg", FileNames.sanitize("รายงาน-2.jpg", "image/jpeg"))
        assertEquals("รายงาน-jpg.zip", FileNames.sanitize("รายงาน-jpg.zip", "application/zip"))
        assertEquals("รายงาน.docx", FileNames.sanitize("รายงาน.docx", FileNames.DOCX))
        assertEquals("x.docx.jpg", FileNames.sanitize("x.docx", "image/jpeg"))
        assertEquals("evil.exe.zip", FileNames.sanitize("evil.exe", "application/zip"))
        assertEquals("document.docx", FileNames.sanitize(" ", FileNames.DOCX))
        assertEquals("page.jpg", FileNames.sanitize(null, "image/jpeg"))
        assertEquals("pages.zip", FileNames.sanitize("..", "application/zip"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnknownTypes() {
        FileNames.sanitize("x", "text/html")
    }
}
